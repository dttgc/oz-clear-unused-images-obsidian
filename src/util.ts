import { App, TFile, TFolder } from 'obsidian';
import OzanClearImages from './main';
import { getAllLinkMatchesInFile, LinkMatch } from './linkDetector';

/* ------------------ Image Handlers  ------------------ */

const imageRegex = /.*(jpe?g|png|gif|svg|bmp)/i;
const bannerRegex = /!\[\[(.*?)\]\]/i;
const imageExtensions: Set<string> = new Set(['jpeg', 'jpg', 'png', 'gif', 'svg', 'bmp', 'webp']);

// Create the List of Unused Images
export const getUnusedAttachments = async (app: App, type: 'image' | 'all') => {
    var allAttachmentsInVault: TFile[] = getAttachmentsInVault(app, type);
    var unusedAttachments: TFile[] = [];
    var usedAttachmentsSet: Set<string>;

    // Get Used Attachments in All Markdown Files
    usedAttachmentsSet = await getAttachmentPathSetForVault(app);

    // Compare All Attachments vs Used Attachments
    allAttachmentsInVault.forEach((attachment) => {
        if (!usedAttachmentsSet.has(attachment.path)) unusedAttachments.push(attachment);
    });

    return unusedAttachments;
};

// Getting all available images saved in vault
const getAttachmentsInVault = (app: App, type: 'image' | 'all'): TFile[] => {
    let allFiles: TFile[] = app.vault.getFiles();
    let attachments: TFile[] = [];
    for (let i = 0; i < allFiles.length; i++) {
        if (!['md', 'canvas'].includes(allFiles[i].extension)) {
            // Only images
            if (imageExtensions.has(allFiles[i].extension.toLowerCase())) {
                attachments.push(allFiles[i]);
            }
            // All Files
            else if (type === 'all') {
                attachments.push(allFiles[i]);
            }
        }
    }
    return attachments;
};

// New Method for Getting All Used Attachments
const getAttachmentPathSetForVault = async (app: App): Promise<Set<string>> => {
    var attachmentsSet: Set<string> = new Set();
    var resolvedLinks = app.metadataCache.resolvedLinks;
    if (resolvedLinks) {
        for (const [mdFile, links] of Object.entries(resolvedLinks)) {
            for (const [filePath, nr] of Object.entries(resolvedLinks[mdFile])) {
                if (!(filePath as String).endsWith('.md')) {
                    attachmentsSet.add(filePath);
                }
            }
        }
    }
    // Loop Files and Check Frontmatter/Canvas
    let allFiles = app.vault.getFiles();
    for (let i = 0; i < allFiles.length; i++) {
        let obsFile = allFiles[i];
        // Check Frontmatter for md files and additional links that might be missed in resolved links
        if (obsFile.extension === 'md') {
            // Frontmatter
            let fileCache = app.metadataCache.getFileCache(obsFile);
            if (fileCache.frontmatter) {
                let frontmatter = fileCache.frontmatter;
                for (let k of Object.keys(frontmatter)) {
                    if (typeof frontmatter[k] === 'string') {
                        if (frontmatter[k].match(bannerRegex)) {
                            let fileName = frontmatter[k].match(bannerRegex)[1];
                            let file = app.metadataCache.getFirstLinkpathDest(fileName, obsFile.path);
                            if (file) {
                                addToSet(attachmentsSet, file.path);
                            }
                        } else if (pathIsAnImage(frontmatter[k])) {
                            addToSet(attachmentsSet, frontmatter[k]);
                        }
                    }
                }
            }
            // Any Additional Link
            let linkMatches: LinkMatch[] = await getAllLinkMatchesInFile(obsFile, app);
            for (let linkMatch of linkMatches) {
                addToSet(attachmentsSet, linkMatch.linkText);
            }
        }
        // Check Canvas for links
        else if (obsFile.extension === 'canvas') {
            let fileRead = await app.vault.cachedRead(obsFile);
            let canvasData = JSON.parse(fileRead);
            if (canvasData.nodes && canvasData.nodes.length > 0) {
                for (const node of canvasData.nodes) {
                    // node.type: 'text' | 'file'
                    if (node.type === 'file') {
                        addToSet(attachmentsSet, node.file);
                    } else if (node.type == 'text') {
                        let linkMatches: LinkMatch[] = await getAllLinkMatchesInFile(obsFile, app, node.text);
                        for (let linkMatch of linkMatches) {
                            addToSet(attachmentsSet, linkMatch.linkText);
                        }
                    }
                }
            }
        }
    }
    return attachmentsSet;
};

const pathIsAnImage = (path: string) => {
    return path.match(imageRegex);
};

/* ------------------ Deleting Handlers  ------------------ */

// Clear Images From the Provided List
export const deleteFilesInTheList = async (
    fileList: TFile[],
    plugin: OzanClearImages,
    app: App
): Promise<{ deletedImages: number; deletedFolders: number; textToView: string }> => {
    var deleteOption = plugin.settings.deleteOption;
    var deletedImages = 0;
    var deletedFolders = 0;
    let textToView = '';
    for (let file of fileList) {
        if (fileIsInExcludedFolder(file, plugin)) {
            console.log('File not referenced but excluded: ' + file.path);
        } else {
            if (deleteOption === '.trash') {
                await app.vault.trash(file, false);
                textToView += `[+] Moved to Obsidian Trash: ` + file.path + '</br>';
            } else if (deleteOption === 'system-trash') {
                await app.vault.trash(file, true);
                textToView += `[+] Moved to System Trash: ` + file.path + '</br>';
            } else if (deleteOption === 'permanent') {
                await app.vault.delete(file);
                textToView += `[+] Deleted Permanently: ` + file.path + '</br>';
            }
            deletedImages++;
        }
    }

    const sortedFolderPaths = getAllFolderPaths(app).sort(
        (first, second) => second.split('/').length - first.split('/').length
    );
    for (let folderPath of sortedFolderPaths) {
        const folder = app.vault.getAbstractFileByPath(folderPath);
        if (
            folder instanceof TFolder &&
            !folder.isRoot() &&
            folder.children.length === 0 &&
            !folderIsProtected(folder.path, plugin, app)
        ) {
            await app.vault.delete(folder);
            textToView += `[+] Deleted Empty Folder: ` + folderPath + '</br>';
            deletedFolders++;
        }
    }

    return { deletedImages, deletedFolders, textToView };
};

const getAllFolderPaths = (app: App): string[] => {
    const folderPaths: string[] = [];
    const collectFolderPaths = (folder: TFolder) => {
        for (let child of folder.children) {
            if (child instanceof TFolder) {
                folderPaths.push(child.path);
                collectFolderPaths(child);
            }
        }
    };
    collectFolderPaths(app.vault.getRoot());
    return folderPaths;
};

const folderIsProtected = (folderPath: string, plugin: OzanClearImages, app: App): boolean => {
    if (pathIsInsideFolder(folderPath, app.vault.configDir) || pathIsInsideFolder(folderPath, '.trash')) {
        return true;
    }

    const excludedFolderPaths = plugin.settings.excludedFolders
        .split(',')
        .map((folderPath) => folderPath.trim())
        .filter((folderPath) => folderPath !== '');
    return excludedFolderPaths.some((excludedFolderPath) =>
        plugin.settings.excludeSubfolders
            ? pathIsInsideFolder(folderPath, excludedFolderPath)
            : folderPath === excludedFolderPath
    );
};

const pathIsInsideFolder = (path: string, folderPath: string): boolean =>
    path === folderPath || path.startsWith(folderPath + '/');

// Check if File is Under Excluded Folders
const fileIsInExcludedFolder = (file: TFile, plugin: OzanClearImages): boolean => {
    var excludedFoldersSettings = plugin.settings.excludedFolders;
    var excludeSubfolders = plugin.settings.excludeSubfolders;
    if (excludedFoldersSettings === '') {
        return false;
    } else {
        // Get All Excluded Folder Paths
        var excludedFolderPaths = new Set(
            excludedFoldersSettings.split(',').map((folderPath) => {
                return folderPath.trim();
            })
        );

        if (excludeSubfolders) {
            // If subfolders included, check if any provided path partially match
            for (let exludedFolderPath of excludedFolderPaths) {
                var pathRegex = new RegExp(exludedFolderPath + '.*');
                if (file.parent.path.match(pathRegex)) {
                    return true;
                }
            }
        } else {
            // Full path of parent should match if subfolders are not included
            if (excludedFolderPaths.has(file.parent.path)) {
                return true;
            }
        }

        return false;
    }
};

/* ------------------ Helpers  ------------------ */

export const getFormattedDate = () => {
    let dt = new Date();
    return dt.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

const addToSet = (setObj: Set<string>, value: string) => {
    if (!setObj.has(value)) {
        setObj.add(value);
    }
};
