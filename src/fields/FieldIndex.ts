import { Component, Notice, TFile } from "obsidian"
import MetadataMenu from "main"
import Field from "./Field";
import { FileClass } from "src/fileClass/fileClass";
import FileClassQuery from "src/fileClass/FileClassQuery";
import FieldSetting from "src/settings/FieldSetting";
import { updateLookups, resolveLookups } from "./fieldManagers/LookupField";

export default class FieldIndex extends Component {

    public fileClassesFields: Map<string, Field[]>;
    public fieldsFromGlobalFileClass: Field[];
    public filesFieldsFromFileClassQueries: Map<string, Field[]>;
    public filesFieldsFromInnerFileClasses: Map<string, Field[]>;
    public filesFields: Map<string, Field[]>;
    public filesFileClass: Map<string, FileClass>
    public fileClassesPath: Map<string, FileClass>
    public fileClassesName: Map<string, FileClass>
    public valuesListNotePathValues: Map<string, string[]>
    public filesFileClassName: Map<string, string | undefined>
    public fileLookupFiles: Map<string, any[]>
    public previousFileLookupFilesValues: Map<string, number>
    public fileLookupFieldLastValue: Map<string, string>
    public fileLookupParents: Map<string, string[]>
    public dv: any
    public lastRevision: 0

    constructor(private plugin: MetadataMenu, public cacheVersion: string, public onChange: () => void) {
        super()
        this.fileClassesFields = new Map();
        this.fieldsFromGlobalFileClass = [];
        this.filesFieldsFromFileClassQueries = new Map();
        this.filesFieldsFromInnerFileClasses = new Map();
        this.filesFields = new Map();
        this.filesFileClass = new Map();
        this.fileClassesPath = new Map();
        this.fileClassesName = new Map();
        this.filesFileClassName = new Map();
        this.valuesListNotePathValues = new Map();
        this.fileLookupFiles = new Map();
        this.fileLookupParents = new Map();
        this.fileLookupFieldLastValue = new Map();
        this.previousFileLookupFilesValues = new Map();
        this.dv = this.plugin.app.plugins.plugins.dataview
    }

    async onload(): Promise<void> {

        if (this.dv?.api.index.initialized) {
            this.dv = this.plugin.app.plugins.plugins.dataview
            this.lastRevision = this.dv.api.index.revision
            await this.fullIndex("dv init");
        }

        this.plugin.registerEvent(
            this.plugin.app.metadataCache.on("dataview:index-ready", async () => {
                this.dv = this.plugin.app.plugins.plugins.dataview
                await this.fullIndex("dv index", true);
                this.lastRevision = this.dv.api.index.revision
            })
        )

        this.plugin.registerEvent(
            this.plugin.app.metadataCache.on('resolved', async () => {
                if (this.plugin.app.metadataCache.inProgressTaskCount === 0) {
                    await this.fullIndex("cache resolved");
                    this.lastRevision = this.dv?.api.index.revision || 0
                }
            })
        )

        this.plugin.registerEvent(
            this.plugin.app.metadataCache.on('dataview:metadata-change', async (op: any, file: TFile) => {
                if (op === "update" && this.dv.api.index.revision !== this.lastRevision) {
                    const classFilesPath = this.plugin.settings.classFilesPath
                    if (classFilesPath && file.path.includes(classFilesPath)) {
                        this.fullIndex("fileClass changed")
                    } else {
                        this.resolveLookups();
                        await this.updateLookups();
                    }
                    this.lastRevision = this.dv.api.index.revision
                }
            })
        )

    }

    async fullIndex(event: string, force_update_lookups = false): Promise<void> {
        //console.log("start full index", event, this.lastRevision, "->", this.dv?.api.index.revision)
        const start = Date.now()
        this.getGlobalFileClass();
        this.getFileClasses();
        this.resolveFileClassQueries();
        this.getFilesFieldsFromFileClass();
        this.getFilesFields();
        await this.getValuesListNotePathValues();
        this.resolveLookups();
        await this.updateLookups(force_update_lookups);
        //console.log("full index", event, this.lastRevision, "->", this.dv?.api.index.revision, `${(Date.now() - start)}ms`)
    }

    resolveLookups(): void {
        resolveLookups(this.plugin);
    }

    async updateLookups(force_update: boolean = false): Promise<void> {
        await updateLookups(this.plugin, force_update);
    }

    async getValuesListNotePathValues(): Promise<void> {
        this.plugin.settings.presetFields.forEach(async setting => {
            if (setting.valuesListNotePath) {
                this.valuesListNotePathValues.set(setting.valuesListNotePath, await FieldSetting.getValuesListFromNote(this.plugin, setting.valuesListNotePath))
            }
        })
    }

    getGlobalFileClass(): void {
        const globalFileClass = this.plugin.settings.globalFileClass
        if (!globalFileClass) {
            this.fieldsFromGlobalFileClass = []
        } else {
            try {
                this.fieldsFromGlobalFileClass = FileClass.createFileClass(this.plugin, globalFileClass).attributes.map(attr => attr.getField())
            } catch (error) { }
        }
    }

    getFileClasses(): void {
        if (this.plugin.settings.classFilesPath) {
            this.plugin.app.vault.getMarkdownFiles()
                .filter(f => f.path.includes(this.plugin.settings.classFilesPath!))
                .forEach(f => {
                    try {
                        const fileClass = FileClass.createFileClass(this.plugin, f.basename)
                        this.fileClassesFields.set(f.basename, fileClass.attributes.map(attr => attr.getField()))
                        this.fileClassesPath.set(f.path, fileClass)
                        this.fileClassesName.set(fileClass.name, fileClass)
                    } catch {

                    }

                })
        }

    }
    resolveFileClassQueries(): void {
        const dvApi = this.plugin.app.plugins.plugins.dataview?.api
        this.plugin.settings.fileClassQueries.forEach(sfcq => {
            const fcq = new FileClassQuery(sfcq.name, sfcq.id, sfcq.query, sfcq.fileClassName)
            fcq.getResults(dvApi).forEach((result: any) => {
                if (this.fileClassesName.get(fcq.fileClassName)) {
                    this.filesFileClass.set(result.file.path, this.fileClassesName.get(fcq.fileClassName)!);
                    this.filesFileClassName.set(result.file.path, fcq.fileClassName)
                }
                const fileFileClassesFieldsFromQuery = this.fileClassesFields.get(fcq.fileClassName)
                if (fileFileClassesFieldsFromQuery) this.filesFieldsFromFileClassQueries.set(result.file.path, fileFileClassesFieldsFromQuery)
            })
        })
    }

    getFilesFieldsFromFileClass(): void {
        this.plugin.app.vault.getMarkdownFiles()
            .filter(f => !this.plugin.settings.classFilesPath || !f.path.includes(this.plugin.settings.classFilesPath))
            .forEach(f => {
                const fileFileClassName = this.plugin.app.metadataCache.getFileCache(f)?.frontmatter?.[this.plugin.settings.fileClassAlias]
                if (fileFileClassName) {
                    if (this.fileClassesName.get(fileFileClassName)) {
                        this.filesFileClass.set(f.path, this.fileClassesName.get(fileFileClassName)!);
                        this.filesFileClassName.set(f.path, fileFileClassName)
                    }
                    const fileClassesFieldsFromFile = this.fileClassesFields.get(fileFileClassName)
                    if (fileClassesFieldsFromFile) {
                        this.filesFieldsFromInnerFileClasses.set(f.path, fileClassesFieldsFromFile);
                        return
                    }
                    this.filesFieldsFromInnerFileClasses.set(f.path, []);
                    return
                }
                this.filesFieldsFromInnerFileClasses.set(f.path, []);
            })
    }

    getFilesFields(): void {
        this.plugin.app.vault.getMarkdownFiles()
            .filter(f => !this.plugin.settings.classFilesPath || !f.path.includes(this.plugin.settings.classFilesPath))
            .forEach(f => {
                const fileFieldsFromInnerFileClasses = this.filesFieldsFromInnerFileClasses.get(f.path)
                if (fileFieldsFromInnerFileClasses?.length) {
                    this.filesFields.set(f.path, fileFieldsFromInnerFileClasses);
                    return
                } else {
                    const fileClassFromQuery = this.filesFieldsFromFileClassQueries.get(f.path);
                    if (fileClassFromQuery) {
                        this.filesFields.set(f.path, fileClassFromQuery)
                    } else if (this.fieldsFromGlobalFileClass.length) {
                        this.filesFields.set(f.path, this.fieldsFromGlobalFileClass)
                        this.filesFileClassName.set(f.path, this.plugin.settings.globalFileClass)
                    } else {
                        this.filesFields.set(f.path, this.plugin.settings.presetFields)
                        this.filesFileClassName.set(f.path, undefined)
                    }
                }
            })
    }
}