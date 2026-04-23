import { TFile, App } from 'obsidian';

/* -------------------- LINK DETECTOR -------------------- */

type LinkType = 'markdown' | 'wiki' | 'wikiTransclusion' | 'mdTransclusion' | 'htmlImage';

export interface LinkMatch {
    type: LinkType;
    match: string;
    linkText: string;
    sourceFilePath: string;
}

/**
 *
 * @param mdFile : File, of which the text content is scanned
 * @param app : Obsidian App
 * @param fileText : Optional, If file is not Md format, provide fileText to scan
 * @returns Promise<LinkMatch[]>
 */
export const getAllLinkMatchesInFile = async (mdFile: TFile, app: App, fileText?: string): Promise<LinkMatch[]> => {
    const linkMatches: LinkMatch[] = [];
    if (fileText === undefined) {
        fileText = await app.vault.read(mdFile);
    }

    // --> Get All WikiLinks
    let wikiRegex = /\[\[.*?\]\]/g;
    let wikiMatches = fileText.match(wikiRegex);
    if (wikiMatches) {
        let fileRegex = /(?<=\[\[).*?(?=(\]|\|))/;

        for (let wikiMatch of wikiMatches) {
            // --> Check if it is Transclusion
            if (matchIsWikiTransclusion(wikiMatch)) {
                let fileName = getTransclusionFileName(wikiMatch);
                let file = app.metadataCache.getFirstLinkpathDest(fileName, mdFile.path);
                if (fileName !== '') {
                    let linkMatch: LinkMatch = {
                        type: 'wikiTransclusion',
                        match: wikiMatch,
                        linkText: file ? file.path : fileName,
                        sourceFilePath: mdFile.path,
                    };
                    linkMatches.push(linkMatch);
                    continue;
                }
            }
            // --> Normal Internal Link
            let fileMatch = wikiMatch.match(fileRegex);
            if (fileMatch) {
                // Web links are to be skipped
                if (fileMatch[0].startsWith('http')) continue;
                let file = app.metadataCache.getFirstLinkpathDest(fileMatch[0], mdFile.path);
                let linkMatch: LinkMatch = {
                    type: 'wiki',
                    match: wikiMatch,
                    linkText: file ? file.path : fileMatch[0],
                    sourceFilePath: mdFile.path,
                };
                linkMatches.push(linkMatch);
            }
        }
    }

    // --> Get All Markdown Links
    let markdownRegex = /\[(^$|.*?)\]\((.*?)\)/g;
    let markdownMatches = fileText.match(markdownRegex);
    if (markdownMatches) {
        let fileRegex = /(?<=\().*(?=\))/;
        for (let markdownMatch of markdownMatches) {
            // --> Check if it is Transclusion
            if (matchIsMdTransclusion(markdownMatch)) {
                let fileName = getTransclusionFileName(markdownMatch);
                let file = app.metadataCache.getFirstLinkpathDest(fileName, mdFile.path);
                if (fileName !== '') {
                    let linkMatch: LinkMatch = {
                        type: 'mdTransclusion',
                        match: markdownMatch,
                        linkText: file ? file.path : fileName,
                        sourceFilePath: mdFile.path,
                    };
                    linkMatches.push(linkMatch);
                    continue;
                }
            }
            // --> Normal Internal Link
            let fileMatch = markdownMatch.match(fileRegex);
            if (fileMatch) {
                // Web links are to be skipped
                if (fileMatch[0].startsWith('http')) continue;
                let file = app.metadataCache.getFirstLinkpathDest(fileMatch[0], mdFile.path);
                let linkMatch: LinkMatch = {
                    type: 'markdown',
                    match: markdownMatch,
                    linkText: file ? file.path : fileMatch[0],
                    sourceFilePath: mdFile.path,
                };
                linkMatches.push(linkMatch);
            }
        }
    }

    // --> Get All HTML img Links
    const htmlImageTagRegex = /<img\b[^>]*>/gi;
    let htmlImageTagMatch: RegExpExecArray | null;
    while ((htmlImageTagMatch = htmlImageTagRegex.exec(fileText)) !== null) {
        let srcPath = getHtmlImageFileName(htmlImageTagMatch[0]);
        if (!srcPath) continue;
        let decodedSrcPath = tryDecodeURIComponent(srcPath);
        let file = app.metadataCache.getFirstLinkpathDest(decodedSrcPath, mdFile.path);

        let linkMatch: LinkMatch = {
            type: 'htmlImage',
            match: htmlImageTagMatch[0],
            linkText: file ? file.path : decodedSrcPath,
            sourceFilePath: mdFile.path,
        };
        linkMatches.push(linkMatch);
    }
    return linkMatches;
};

/* ---------- HELPERS ---------- */

const wikiTransclusionRegex = /\[\[(.*?)#.*?\]\]/;
const wikiTransclusionFileNameRegex = /(?<=\[\[)(.*)(?=#)/;

const mdTransclusionRegex = /\[.*?]\((.*?)#.*?\)/;
const mdTransclusionFileNameRegex = /(?<=\]\()(.*)(?=#)/;

const htmlImageRegex = /<img\b[^>]*>/i;
const htmlImageFileNameRegex = /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'<>]+))/i;

const matchIsWikiTransclusion = (match: string): boolean => {
    return wikiTransclusionRegex.test(match);
};

const matchIsMdTransclusion = (match: string): boolean => {
    return mdTransclusionRegex.test(match);
};

const matchIsHtmlImage = (match: string): boolean => {
    return htmlImageRegex.test(match);
};

/**
 * @param match
 * @returns file name if there is a match or empty string if no match
 */
const getTransclusionFileName = (match: string): string => {
    let isWiki = wikiTransclusionRegex.test(match);
    let isMd = mdTransclusionRegex.test(match);
    if (isWiki || isMd) {
        let fileNameMatch = match.match(isWiki ? wikiTransclusionFileNameRegex : mdTransclusionFileNameRegex);
        if (fileNameMatch) return fileNameMatch[0];
    }
    return '';
};

/**
 * Extracts the `src` value from an HTML `<img>` tag.
 * @param match Full HTML <img> tag text.
 * @returns Trimmed image path if a `src` attribute exists, otherwise an empty string.
 */
const getHtmlImageFileName = (match: string): string => {
    if (matchIsHtmlImage(match)) {
        let fileNameMatch = match.match(htmlImageFileNameRegex);
        if (fileNameMatch) {
            const [, doubleQuotedSrc, singleQuotedSrc, unquotedSrc] = fileNameMatch;
            return (doubleQuotedSrc || singleQuotedSrc || unquotedSrc || '').trim();
        }
    }

    return '';
};

/**
 * @param value URI-encoded or plain text value.
 * @returns Decoded value, or the original string if decoding throws.
 */
const tryDecodeURIComponent = (value: string): string => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};
