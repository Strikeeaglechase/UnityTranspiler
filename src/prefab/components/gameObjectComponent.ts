import { BaseComponent, ComponentType, RawComponent } from "./baseComponent.js";
import { PrefabInstanceComponent } from "./prefabInstanceComponent.js";

export class GameObjectComponent extends BaseComponent {
	public type: ComponentType.GameObject = ComponentType.GameObject;
	public codeType: string = "GameObject";

	public name: string;
	private _children: string[] = [];
	public get children() {
		if (this.strippedSourceObject) {
			const pfInst = this.prefab.getComponent<PrefabInstanceComponent>(this.prefabInstance, ComponentType.PrefabInstance);
			const refedComp = pfInst.sourcePrefab.getComponent<GameObjectComponent>(this.strippedSourceObject.fileId, ComponentType.GameObject);

			return refedComp.children;
		}

		return this._children;
	}
	public set children(value: string[]) {
		if (this.strippedSourceObject) {
			throw new Error("Cannot set children on a stripped TransformComponent");
		}

		this._children = value;
	}
	public isActive: boolean;

	public strippedSourceObject: { fileId: string; guid: string };
	public prefabInstance: string;

	public buildFromRaw(goComponent: RawComponent): void {
		super.buildFromRaw(goComponent);

		if (goComponent.stripped) {
			this.buildFromRawStripped(goComponent);
			return;
		}

		const childrenBlock = goComponent.content.match(/m_Component:((?:\n  - component: {fileID: \d+})*)/)[1];
		this.children = [...childrenBlock.matchAll(/fileID: (\d+)/g)].map(m => m[1]);
		this.isActive = goComponent.content.includes("m_IsActive: 1");
		this.name = goComponent.content.match(/m_Name: (.+)/)[1].trim();
	}

	public getRef(): string {
		if (this.strippedSourceObject) {
			const pfInst = this.prefab.getComponent<PrefabInstanceComponent>(this.prefabInstance, ComponentType.PrefabInstance);

			return `${pfInst.getRef()}.gameObjectFileIdMap[${this.strippedSourceObject.fileId}]`;
		}

		return `gameObject${this.id}`;
	}

	public getCtor(): string {
		if (this.strippedSourceObject) return "";

		return `var ${this.getRef()} = new GameObject("${this.name}");`;
	}

	public getSetupCode(): string {
		if (this.strippedSourceObject) return "";

		// console.log({ id: this.id, name: this.name, isActive: this.isActive, children: this.children });
		let result = `${this.getRef()}.SetActive(${this.isActive ? "true" : "false"});\n`;
		if (this.children.length > 0) {
			const childComponents = this.children.map(childId => this.prefab.getComponent(childId)).filter(comp => comp != null);
			const childrenRefs = childComponents.map(child => child.getRef());

			result += `${this.getRef()}.sourcePrefab = new ${this.prefab.cleanName}();\n`;
			result += `${this.getRef()}.AddComponents(${childrenRefs.join(", ")});\n`;

			// childComponents
			// 	.filter(child => child.type == ComponentType.PrefabInstance)
			// 	.forEach(child => {
			// 		const pfInstRoot = child.sourcePrefab.root;
			// 		// console.log(child);
			// 		const rootTf = child.sourcePrefab.components.find(c => c.type == ComponentType.Transform && c.gameObject == pfInstRoot.id);

			// 		result += `((Transform)${child.getRef()}.componentFileIdMap[${rootTf.id}]).parent = ${this.getRef()};\n`;
			// 	});
		}

		return result;
	}

	public _getSetupCode(): string {
		if (this.strippedSourceObject) return "";

		// console.log({ id: this.id, name: this.name, isActive: this.isActive, children: this.children });
		let result = `${this.getRef()}.SetActive(${this.isActive ? "true" : "false"});\n`;
		if (this.children.length > 0) {
			const childComponents = this.children.map(childId => this.prefab.getComponent(childId)).filter(comp => comp != null);
			const childrenRefs = childComponents.filter(child => child.type != ComponentType.PrefabInstance).map(child => child.getRef());

			result += `${this.getRef()}.sourcePrefab = new ${this.prefab.cleanName}();\n`;
			result += `${this.getRef()}.AddComponents(${childrenRefs.join(", ")});\n`;

			childComponents
				.filter(child => child.type == ComponentType.PrefabInstance)
				.forEach(child => {
					const pfInstRoot = child.sourcePrefab.root;
					// console.log(child);
					const rootTf = child.sourcePrefab.components.find(c => c.type == ComponentType.Transform && c.gameObject == pfInstRoot.id);

					result += `((Transform)${child.getRef()}.componentFileIdMap[${rootTf.id}]).parent = ${this.getRef()};\n`;
				});
		}

		return result;
	}

	public toString(): string {
		return `GameObject(id: ${this.id}, name: ${this.name})`;
	}
}
