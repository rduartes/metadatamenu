import MetadataMenu from "main";
import { ButtonComponent, DropdownComponent, Modal, Notice, TextComponent, TextAreaComponent, ToggleComponent, setIcon } from "obsidian";
import Field, { FieldCommand } from "src/fields/Field";
import FieldSetting from "src/settings/FieldSetting";
import { FieldManager as F, SettingLocation } from "src/fields/FieldManager";
import { FieldManager, FieldType, FieldTypeLabelMapping, FieldTypeTooltip, MultiDisplayType, multiTypes } from "src/types/fieldTypes";
import { FieldHTMLTagMap, FieldStyle, FieldStyleKey, FieldStyleLabel } from "src/types/dataviewTypes";
import { cleanActions } from "src/utils/modals";
import { v4 as uuidv4 } from 'uuid';

export default class FieldSettingsModal extends Modal {
    private namePromptComponent: TextComponent;
    private saved: boolean = false;
    private field: Field;
    private initialField: Field;
    private new: boolean = true;
    private fieldOptionsContainer: HTMLDivElement;
    private fieldManager: F;
    private command: FieldCommand;
    private addCommand: boolean;
    private autoSuggest?: boolean;
    private frontmatterListDisplay?: MultiDisplayType;
    private frontmatterListDisplayContainer: HTMLDivElement;
    private iconName: TextComponent;

    constructor(
        private plugin: MetadataMenu,
        private parentSettingContainer: HTMLElement,
        private parentSetting?: FieldSetting,
        field?: Field
    ) {
        super(plugin.app);
        this.initialField = new Field();
        if (field) {
            this.new = false;
            this.field = field;
            Field.copyProperty(this.initialField, this.field)
        } else {
            const id = uuidv4()
            this.field = new Field();
            this.field.id = id;
            this.initialField.id = id;
        };
        this.fieldManager = new FieldManager[this.field.type](this.plugin, this.field);
        this.addCommand = this.field.command !== undefined;
        this.command = this.field.command || {
            id: this.field ? `insert__${this.field.fileClassName || "presetField"}__${this.field.name}` : "",
            icon: "list-plus",
            label: this.field ? `Insert ${this.field.name} field` : "",
            hotkey: undefined
        }
    };

    async onOpen(): Promise<void> {
        this.containerEl.addClass("metadata-menu")
        if (this.field.name == "") {
            this.titleEl.setText(`Add a field and define options`);
        } else {
            this.titleEl.setText(`Manage settings options for ${this.field.name}`);
        };

        /* Name and parent */
        this.createnameInputContainer();
        this.createParentSelectContainer();
        this.contentEl.createEl("hr");

        /* Commands and display */
        this.createCommandContainer();
        this.createFrontmatterListDisplayContainer();
        const styleContainer = this.contentEl.createDiv({ cls: "field-container" })

        /* Type */
        const typeSelectContainer = this.contentEl.createDiv({ cls: "field-container" });
        this.contentEl.createEl("hr");

        /* Options */
        this.fieldOptionsContainer = this.contentEl.createDiv();

        /* footer buttons*/
        cleanActions(this.contentEl, ".footer-actions")
        const footer = this.contentEl.createDiv({ cls: "footer-actions" });
        footer.createDiv({ cls: "spacer" })
        this.createSaveButton(footer);
        this.createCancelButton(footer);

        /* init state */
        this.createStyleSelectorContainer(styleContainer)
        this.createTypeSelectorContainer(typeSelectContainer)
        this.fieldManager.createSettingContainer(this.fieldOptionsContainer, this.plugin, SettingLocation.PluginSettings)
    };

    onClose(): void {
        Object.assign(this.field, this.initialField);
        if (!this.new && this.parentSetting) {
            this.parentSetting.setTextContentWithname()
        } else if (this.saved) {
            new FieldSetting(this.parentSettingContainer, this.field, this.plugin);
        };
    };

    private createnameInputContainer(): void {
        const container = this.contentEl.createDiv({ cls: "field-container" })
        container.createDiv({ cls: "label", text: "Field Name: " });
        const input = new TextComponent(container);
        input.inputEl.addClass("with-label");
        input.inputEl.addClass("full-width");
        const name = this.field.name;
        input.setValue(name);
        input.setPlaceholder("Name of the field");
        input.onChange(value => {
            this.field.name = value;
            this.command.id = `insert__${this.field.fileClassName || "presetField"}__${value}`
            this.command.label = `Insert ${value} field`
            this.titleEl.setText(`Manage predefined options for ${this.field.name}`);
            FieldSettingsModal.removeValidationError(input);
        });
        this.namePromptComponent = input;
    };

    private createParentSelectContainer(): void {
        const compatibleParents = this.field.getCompatibleParentFieldsNames(this.plugin)
        const container = this.contentEl.createDiv({ cls: "field-container" })
        const parentSelectorContainerLabel = container.createDiv({ cls: "label" });
        parentSelectorContainerLabel.setText(`Parent:`);
        container.createDiv({ cls: "spacer" })
        const select = new DropdownComponent(container);
        select.addOption("none", "--None--")
        compatibleParents.forEach(parent => select.addOption(parent, parent))
        if (this.field.parent) {
            select.setValue(this.field.parent || "none")
        } else {
            select.setValue("none")
        }

        select.onChange((value: string) => {
            this.field.parent = value !== "none" ? value : undefined
        })
    }

    private setLabelStyle(label: HTMLDivElement): void {
        const fieldStyle = this.field.style || {}
        Object.keys(FieldStyle).forEach((style: keyof typeof FieldStyle) => {
            const styleKey = FieldStyleKey[style]
            if (!!fieldStyle[styleKey]) {
                label.addClass(styleKey)
            } else {
                label.removeClass(styleKey)
            }
        })
    }

    private createStyleSelectorContainer(parentNode: HTMLDivElement): void {
        const styleSelectorLabel = parentNode.createDiv({ cls: "label" });
        styleSelectorLabel.setText(`Inline field style`);
        this.setLabelStyle(styleSelectorLabel);
        parentNode.createDiv({ text: "::" })
        parentNode.createDiv({ cls: "spacer" });
        const styleButtonsContainer = parentNode.createDiv({ cls: "style-buttons-container" });
        Object.keys(FieldStyle).forEach((style: keyof typeof FieldStyle) => {
            const styleBtnContainer = styleButtonsContainer.createEl(FieldHTMLTagMap[style], { cls: "style-button-container" });
            styleBtnContainer.createDiv({ cls: "style-btn-label", text: FieldStyleKey[style] });
            const styleBtnToggler = new ToggleComponent(styleBtnContainer);
            const fieldStyle = this.field.style || {};
            styleBtnToggler.setValue(fieldStyle[FieldStyleKey[style]])
            styleBtnToggler.onChange(v => {
                fieldStyle[FieldStyleKey[style]] = v;
                this.field.style = fieldStyle;
                this.setLabelStyle(styleSelectorLabel);
            })
        })
    }

    private createTypeSelectorContainer(parentNode: HTMLDivElement): void {
        const typeSelectorContainerLabel = parentNode.createDiv({ cls: "label" });
        typeSelectorContainerLabel.setText(`Field type:`);
        parentNode.createDiv({ cls: "spacer" })
        const select = new DropdownComponent(parentNode);
        Object.keys(FieldTypeLabelMapping).forEach((f: keyof typeof FieldType) => select.addOption(f, FieldTypeTooltip[f]))
        if (this.field.type) {
            select.setValue(this.field.type)
            if (multiTypes.includes(this.field.type)) {
                this.frontmatterListDisplayContainer.show()
            } else {
                this.frontmatterListDisplayContainer.hide()
            }
        }

        select.onChange((typeLabel: keyof typeof FieldType) => {
            this.field = new Field();
            Field.copyProperty(this.field, this.initialField);
            this.field.name = this.namePromptComponent.getValue()
            this.field.type = FieldTypeLabelMapping[typeLabel];
            if (this.field.type !== this.initialField.type &&
                ![this.field.type, this.initialField.type].every(fieldType =>
                    [FieldType.Multi, FieldType.Select, FieldType.Cycle].includes(fieldType)
                )
            ) {
                this.field.options = {}
            }
            if (multiTypes.includes(this.field.type)) {
                this.frontmatterListDisplayContainer.show()
            } else {
                this.frontmatterListDisplayContainer.hide()
            }
            while (this.fieldOptionsContainer.firstChild) {
                this.fieldOptionsContainer.removeChild(this.fieldOptionsContainer.firstChild);
            }
            this.fieldManager = new FieldManager[this.field.type](this.plugin, this.field)
            this.fieldManager.createSettingContainer(this.fieldOptionsContainer, this.plugin, SettingLocation.PluginSettings)
        })
    }

    private createFrontmatterListDisplayContainer(): void {
        this.frontmatterListDisplayContainer = this.contentEl.createDiv({ cls: "field-container" })
        //label
        this.frontmatterListDisplayContainer.createDiv({ text: "Frontmatter list display type", cls: "label" });
        this.frontmatterListDisplayContainer.createDiv({ cls: "spacer" });
        //add toggler
        const frontmatterListDisplay = new DropdownComponent(this.frontmatterListDisplayContainer);
        const options: Record<string, string> = {}
        options["asArray"] = "display as array"
        options["asList"] = "display as indented list"
        options["undefined"] = `Plugin Default (${this.plugin.settings.frontmatterListDisplay})`
        frontmatterListDisplay.addOptions(options);
        switch (this.field.display) {
            case MultiDisplayType.asArray: frontmatterListDisplay.setValue("asArray"); break
            case MultiDisplayType.asList: frontmatterListDisplay.setValue("asList"); break
            case undefined: frontmatterListDisplay.setValue("undefined"); break
        }

        frontmatterListDisplay.onChange(value => {
            switch (value) {
                case "asArray": this.frontmatterListDisplay = MultiDisplayType.asArray; break;
                case "asList": this.frontmatterListDisplay = MultiDisplayType.asList; break;
                case "undefined": this.frontmatterListDisplay = undefined; break;
                default: this.frontmatterListDisplay = undefined;
            }
        });
    }

    private createCommandContainer(): void {

        const commandContainer = this.contentEl.createDiv({ cls: "field-container" })
        //label
        commandContainer.createDiv({ text: "set a command for this field?", cls: "label" });
        commandContainer.createDiv({ cls: "spacer" });
        //add command
        const addCommandToggler = new ToggleComponent(commandContainer);
        addCommandToggler.setValue(this.addCommand);

        // options
        const iconContainer = this.contentEl.createDiv({ cls: "field-container" })
        this.addCommand ? iconContainer.show() : iconContainer.hide();

        // icon
        iconContainer.createDiv({ text: "Icon name", cls: "label" })
        this.iconName = new TextComponent(iconContainer)
        this.iconName.inputEl.addClass("full-width");
        this.iconName.inputEl.addClass("with-label");
        const iconPreview = iconContainer.createDiv({ cls: "icon-preview" })
        this.iconName.setValue(this.command.icon)
        setIcon(iconPreview, this.command.icon)
        this.iconName.onChange(value => {
            this.command.icon = value;
            setIcon(iconPreview, value)
        })

        addCommandToggler.onChange(value => {
            this.addCommand = value
            this.addCommand ? iconContainer.show() : iconContainer.hide();
        });
    }

    private validateFields(): boolean {
        return this.fieldManager.validateName(
            this.namePromptComponent,
            this.contentEl
        ) &&
            this.fieldManager.validateOptions();
    }

    private createSaveButton(container: HTMLDivElement): void {
        const b = new ButtonComponent(container)
        b.setTooltip("Save");
        b.setIcon("checkmark");
        b.onClick(async () => {
            let error = !this.validateFields();
            if (error) {
                new Notice("Fix errors before saving.");
                return;
            };
            if (this.addCommand) {
                this.field.command = this.command
            } else {
                delete this.field.command
            }
            if (this.frontmatterListDisplay !== undefined) {
                this.field.display = this.frontmatterListDisplay
            } else {
                delete this.field.display
            }
            this.saved = true;
            const currentExistingField = this.plugin.initialProperties.filter(p => p.id == this.field.id)[0];
            if (currentExistingField) {
                Field.copyProperty(currentExistingField, this.field);
            } else {
                this.plugin.initialProperties.push(this.field);
            };
            Field.copyProperty(this.initialField, this.field)
            if (this.parentSetting) Field.copyProperty(this.parentSetting.field, this.field);
            this.parentSetting?.setTextContentWithname()
            this.plugin.saveSettings();
            this.close();
        });
    };

    private createCancelButton(container: HTMLDivElement): void {
        const b = new ButtonComponent(container);
        b.setIcon("cross")
            .setTooltip("Cancel")
            .onClick(() => {
                this.saved = false;
                /* reset options from settings */
                if (this.initialField.name != "") {
                    Object.assign(this.field, this.initialField);
                };
                this.close();
            });
    };

    /* utils functions */

    public static setValidationError(textInput: TextComponent, message?: string) {
        textInput.inputEl.addClass("is-invalid");
        const fieldContainer = textInput.inputEl.parentElement;
        const fieldsContainer = fieldContainer?.parentElement;
        if (message && fieldsContainer) {
            let mDiv = fieldsContainer.querySelector(".field-error") as HTMLDivElement;
            if (!mDiv) mDiv = createDiv({ cls: "field-error" });
            mDiv.innerText = message;
            fieldsContainer.insertBefore(mDiv, fieldContainer);
        }
    }
    public static removeValidationError(textInput: TextComponent | TextAreaComponent) {
        if (textInput.inputEl.hasClass("is-invalid")) textInput.inputEl.removeClass("is-invalid");
        const fieldContainer = textInput.inputEl.parentElement;
        const fieldsContainer = fieldContainer?.parentElement;
        const fieldError = fieldsContainer?.querySelector(".field-error")
        if (fieldError) fieldsContainer!.removeChild(fieldError)
    };
};