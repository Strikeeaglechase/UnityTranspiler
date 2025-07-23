import { prefabFileIdMap, scriptableObjectGuidsMap, scriptGuidsMap } from "../../index.js";
import { Prefab } from "../prefab.js";
import { getAllTypes, getScriptTypeWithBase, TypeData } from "../scriptTypeExtractor.js";
import { BaseComponent, ComponentType, RawComponent } from "./baseComponent.js";
import { PrefabInstanceComponent } from "./prefabInstanceComponent.js";

function parseBool(value: string) {
	if (value == "0" || value == "false" || value == "False") return false;
	return true;
}

export function parseValue(prefab: Prefab, value: string, type: string) {
	if (value.match(/{fileID: (\d+)}/)) {
		const fileId = value.match(/{fileID: (\d+)}/)[1];
		if (fileId == "0") return "null";
		return prefab.getComponent(fileId).getRef();
	}

	const vecRegex = /{x: ([\d.\-e]+), y: ([\d.\-e]+), z: ([\d.\-e]+)}/;
	const quatRegex = /{x: ([\d.\-e]+), y: ([\d.\-e]+), z: ([\d.\-e]+), w: ([\d.\-e]+)}/;
	const colorRegex = /{r: ([\d.\-e]+), g: ([\d.\-e]+), b: ([\d.\-e]+), a: ([\d.\-e]+)}/;

	if (value.match(vecRegex)) {
		const [_, x, y, z] = value.match(vecRegex);
		return `new Vector3(${x}f, ${y}f, ${z}f)`;
	}

	if (value.match(quatRegex)) {
		const [_, x, y, z, w] = value.match(quatRegex);
		return `new Quaternion(${x}f, ${y}f, ${z}f, ${w}f)`;
	}

	if (value.match(colorRegex)) {
		const [_, r, g, b, a] = value.match(colorRegex);
		return `new Color(${r}f, ${g}f, ${b}f, ${a}f)`;
	}

	const scriptableObjectRegex = /{fileID: 11400000, guid: ([\w\d]+), type: 2}/;
	if (value.match(scriptableObjectRegex)) {
		const scriptGuid = value.match(scriptableObjectRegex)[1];
		const so = scriptableObjectGuidsMap[scriptGuid];

		if (!so) {
			console.log(`ScriptableObject with GUID ${scriptGuid} not found for MonoBehaviour property reference ${this.id}`);
			return value;
		}

		return `${so.cleanName}.instance`;
	}

	const objectRefRegex = /{fileID: (\d+), guid: ([\w\d]+), type: 3}/;
	if (value.match(objectRefRegex)) {
		const [_, fileId, guid] = value.match(objectRefRegex);
		const prefab = prefabFileIdMap[fileId];
		if (!prefab) {
			console.log(`Prefab with file ID ${fileId} not found for MonoBehaviour property reference ${this.id}`);
			return value;
		}

		return `${prefab.cleanName}.Create()`;
	}

	// Handle empty arrays
	if (value == "[]") return `new()`;

	switch (type) {
		case "float":
			return `${value}f`;
		case "int":
			return value;
		case "bool":
			return parseBool(value) ? "true" : "false";
		case "string":
			return `"${value.replace(/"/g, '\\"').replace(/\\/g, "\\\\")}"`;
		default:
			// return `${value}; // ${type}`;
			return `(${type})${value}`;
	}

	return value;
}

interface Property {
	key: string;
	value: string | string[];
}

export class MonoBehaviourComponent extends BaseComponent {
	public type: ComponentType.MonoBehaviour = ComponentType.MonoBehaviour;
	public get codeType(): string {
		const script = scriptGuidsMap[this.scriptGuid];
		if (!script) return "MonoBehaviour";
		return script.name;
	}

	public gameObject: string;
	public enabled: boolean;
	public scriptGuid: string;
	public name: string;
	public properties: Property[];

	private typeData: TypeData;
	private allTypes: TypeData[];

	public buildFromRaw(behaveComponent: RawComponent): void {
		super.buildFromRaw(behaveComponent);
		if (behaveComponent.stripped) return;

		this.gameObject = behaveComponent.content.match(/m_GameObject: {fileID: (\d+)}/)[1];
		this.enabled = behaveComponent.content.includes("m_Enabled: 1");
		this.scriptGuid = behaveComponent.content.match(/m_Script: {fileID: \d+, guid: ([\w\d]+), type: 3}/)[1];
		this.name = behaveComponent.content.match(/m_Name: (.+)/)?.[1].trim() ?? "";

		const propLines = behaveComponent.content
			.split("\n")
			.slice(2)
			.filter(l => !l.trim().startsWith("m_") && l.trim().length > 0);

		const properties: Property[] = [];
		for (let i = 0; i < propLines.length; i++) {
			const line = propLines[i];
			const colon = line.indexOf(":");
			if (colon === -1) {
				console.log(`Processing property line for MonoBehaviour ${behaveComponent.id}, line has no colon: "${line}"`);
				continue;
			}

			const key = line.substring(0, colon).trim();
			const value = line.substring(colon + 2);

			// If next line starts with "- ", then the current line is the key of an array property
			const isArray = i < propLines.length - 1 && !!propLines[i + 1].match(/^ {2,}- /);

			if (isArray) {
				const arrayValues: string[] = [];
				let currentValue = null;
				i++;
				while (i < propLines.length) {
					const nextLine = propLines[i];

					if (nextLine.match(/^ {2,}- /)) {
						if (currentValue != null) arrayValues.push(currentValue);
						currentValue = nextLine.trimStart().substring(2);
					} else if (nextLine.startsWith("    ")) {
						// Handling for struct's sub-properties
						currentValue += "\n" + nextLine.trimStart();
					} else {
						if (currentValue != null) arrayValues.push(currentValue);
						currentValue = null;
						i--; // Go back one line to process the next property
						break;
					}

					i++;
				}

				if (currentValue != null) {
					arrayValues.push(currentValue);
				}

				properties.push({ key: key, value: arrayValues });
			} else {
				const isStruct = value == "" && i < propLines.length - 1 && propLines[i + 1].startsWith("    ");
				if (!isStruct) {
					properties.push({ key: key, value: value });
					continue;
				}

				let structLines: string[] = [];
				i++;
				while (i < propLines.length && propLines[i].startsWith("    ")) {
					structLines.push(propLines[i++].trimStart());
				}
				i--;

				properties.push({
					key: key,
					value: structLines.join("\n")
				});
			}
		}

		this.properties = properties;
	}

	public buildFromRawStripped(behaveComponent: RawComponent): void {
		super.buildFromRawStripped(behaveComponent);

		this.scriptGuid = behaveComponent.content.match(/m_Script: {fileID: \d+, guid: ([\w\d]+), type: 3}/)[1];
	}

	public getRef(): string {
		if (this.strippedSourceObject) {
			const pfInst = this.prefab.getComponent<PrefabInstanceComponent>(this.prefabInstance, ComponentType.PrefabInstance);

			return `((${this.codeType})${pfInst.getRef()}.componentFileIdMap[${this.strippedSourceObject.fileId}])`;
		}

		return `behaviour${this.id}`;
	}

	public getCtor(): string {
		if (this.strippedSourceObject) return "";
		const script = scriptGuidsMap[this.scriptGuid];
		if (!script) {
			console.warn(`Script with GUID ${this.scriptGuid} not found for component ${this.id}`);
			return `var ${this.getRef()} = new MonoBehaviour();`;
		}

		return `var ${this.getRef()} = new ${script.name}();`;
	}

	private isStructValue(value: string) {
		return value.match(/[\w\d]+:.+\n[\w\d]+:/);
	}

	private parseStructAssigns(value: string): { key: string; value: string }[] {
		const match = value.matchAll(/([\w\d]+): (.+)/g);
		return [...match].map(m => ({ key: m[1], value: m[2] }));
	}

	private resolveTypeFromPossiblyGeneric(type: string) {
		if (type.match(/<([\w\d]+)>/)) return type.match(/<([\w\d]+)>/)[1];
		if (type.includes(".")) return type.split(".").at(-1);
		return type;
	}

	private handleAnimationCurve(prop: Property) {
		if (Array.isArray(prop.value)) {
			console.log(`AnimationCurve property "${prop.key}" in MonoBehaviour ${this.id} is an array, which is not supported.`);
			return "";
		}

		const kfsMatch = prop.value.matchAll(/- serializedVersion: 3\ntime: ([\d-.e]+)\nvalue: ([\d-.e]+)\ninSlope: ([\d-.e]+)\noutSlope: ([\d-.e]+)/g);

		const keyframes = [...kfsMatch].map(m => {
			const time = parseFloat(m[1]);
			const value = parseFloat(m[2]);
			const inSlope = parseFloat(m[3]);
			const outSlope = parseFloat(m[4]);

			return `new Keyframe(${time}f, ${value}f, ${inSlope}f, ${outSlope}f)`;
		});

		return `${this.getRef()}.${prop.key} = new AnimationCurve(${keyframes.join(", ")});`;
	}

	private processProperty(prop: Property): string {
		const ref = this.getRef();
		const propField = this.typeData.fields.find(f => f.name == prop.key);
		if (!propField) {
			console.log(`Cannot find type data for property "${prop.key}" in MonoBehaviour ${this.id}`);
			return `// Property "${prop.key}" not found in MonoBehaviour ${this.id}`;
		}
		const isList = propField.type.match(/List<.+>/) != undefined;
		const propType = this.resolveTypeFromPossiblyGeneric(propField.type);

		if (propType == "AnimationCurve") {
			return this.handleAnimationCurve(prop);
		}

		if (Array.isArray(prop.value)) {
			const childResults = prop.value
				.map((v, i) => {
					if (!this.isStructValue(v)) {
						if (isList) return `${ref}.${prop.key}.Add(${parseValue(this.prefab, v, propType)});`;
						return `${ref}.${prop.key}[${i}] = ${parseValue(this.prefab, v, propType)};`;
					}

					const structProps = this.parseStructAssigns(v);
					const structType = this.allTypes.find(t => t.name == propType);
					if (!structType) {
						console.log(`Cannot find type data for struct prop ${prop.key} with type ${propType} in MonoBehaviour ${this.id}`);
					}

					let structIdxResult = `var ${ref}${prop.key}${i} = ${ref}.${prop.key}.ElementAtOrDefaultSafe(${i});\n`;

					structProps.forEach(sp => {
						const spTypeProp = structType.fields.find(f => f.name == sp.key);
						if (!spTypeProp) {
							console.log(`Cannot find type data for struct, prop ${prop.key} type ${propType} subProp ${sp.key} in MonoBehaviour ${this.id}`);
						}
						const spType = this.resolveTypeFromPossiblyGeneric(spTypeProp.type);

						structIdxResult += `${ref}${prop.key}${i}.${sp.key} = ${parseValue(this.prefab, sp.value, spType)};\n`;
					});

					if (isList) {
						structIdxResult += `${ref}.${prop.key}.Add(${ref}${prop.key}${i});`;
					} else {
						structIdxResult += `${ref}.${prop.key}[${i}] = ${ref}${prop.key}${i};`;
					}

					return structIdxResult;
				})
				.join("\n");

			return `${ref}.${prop.key} = new(${prop.value.length});\n${childResults}`;
		} else {
			if (!this.isStructValue(prop.value)) {
				return `${ref}.${prop.key} = ${parseValue(this.prefab, prop.value, propType)};`;
			}

			const structProps = this.parseStructAssigns(prop.value);
			const structType = this.allTypes.find(t => t.name == propType);
			if (!structType) {
				console.log(`Cannot find type data for struct prop ${prop.key} with type ${propType} in MonoBehaviour ${this.id}`);
			}

			return structProps
				.map(sp => {
					const spTypeProp = structType.fields.find(f => f.name == sp.key);
					if (!spTypeProp) {
						console.log(`Cannot find type data for struct, prop ${prop.key} type ${propType} subProp ${sp.key} in MonoBehaviour ${this.id}`);
					}
					const spType = this.resolveTypeFromPossiblyGeneric(spTypeProp.type);
					return `${ref}.${prop.key}.${sp.key} = ${parseValue(this.prefab, sp.value, spType)};`;
				})
				.join("\n");
		}
	}

	public getSetupCode(): string {
		if (this.strippedSourceObject) return "";
		const script = scriptGuidsMap[this.scriptGuid];

		if (!script) {
			return `// Script with GUID ${this.scriptGuid} not found for component ${this.id}`;
		}

		if (this.prefab) this.prefab.constructedScripts.push(script);

		this.typeData = getScriptTypeWithBase(script.name);
		this.allTypes = getAllTypes();

		if (!this.properties) {
			console.log(`No props: ${this.name}, ${this.id}`);
		}

		let result = this.properties.map(prop => this.processProperty(prop)).join("\n");
		result += `\n${this.getRef()}.enabled = ${this.enabled};\n`;

		return result;
	}

	public toString(): string {
		return `MonoBehaviorComponent(id: ${this.id}, name: ${this.name})`;
	}
}
