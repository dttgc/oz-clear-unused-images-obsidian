import { Plugin, TFile, Notice } from 'obsidian';
import { OzanClearImagesSettingsTab } from './settings';
import { OzanClearImagesSettings, DEFAULT_SETTINGS } from './settings';
import { LogsModal } from './modals';
import * as Util from './util';

export default class OzanClearImages extends Plugin {
    settings: OzanClearImagesSettings;
    ribbonIconEl: HTMLElement | undefined = undefined;

    async onload() {
        console.log('Clear Unused Images plugin loaded...');
        this.addSettingTab(new OzanClearImagesSettingsTab(this.app, this));
        await this.loadSettings();
        this.addCommand({
            id: 'clear-images-obsidian',
            name: 'Clear Unused Images',
            callback: () => this.clearUnusedAttachments('image'),
        });
        this.addCommand({
            id: 'clear-unused-attachments',
            name: 'Clear Unused Attachments',
            callback: () => this.clearUnusedAttachments('all'),
        });
        this.refreshIconRibbon();
    }

    onunload() {
        console.log('Clear Unused Images plugin unloaded...');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    refreshIconRibbon = () => {
        this.ribbonIconEl?.remove();
        if (this.settings.ribbonIcon) {
            this.ribbonIconEl = this.addRibbonIcon('image-file', 'Clear Unused Images', (event): void => {
                this.clearUnusedAttachments('image');
            });
        }
    };

    // Compare Used Images with all images and return unused ones
    clearUnusedAttachments = async (type: 'all' | 'image') => {
        var unusedAttachments: TFile[] = await Util.getUnusedAttachments(this.app, type);
        let logs = '';
        logs += `[+] ${Util.getFormattedDate()}: Clearing started.</br>`;
        const { deletedImages, deletedFolders, textToView } = await Util.deleteFilesInTheList(
            unusedAttachments,
            this,
            this.app
        );
        logs += textToView;
        logs += '[+] ' + deletedImages.toString() + ' image(s) in total deleted.</br>';
        logs += '[+] ' + deletedFolders.toString() + ' empty folder(s) in total deleted.</br>';
        logs += `[+] ${Util.getFormattedDate()}: Clearing completed.`;

        if (deletedImages > 0 || deletedFolders > 0) {
            if (this.settings.logsModal) {
                let modal = new LogsModal(logs, this.app);
                modal.open();
            }
        } else {
            new Notice(`All ${type === 'image' ? 'images' : 'attachments'} are used. Nothing was deleted.`);
        }
    };
}
