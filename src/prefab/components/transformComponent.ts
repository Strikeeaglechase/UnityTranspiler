import { assert } from "../../index.js";
import { BaseComponent, ComponentType, Quaternion, RawComponent, Vector3 } from "./baseComponent.js";
import { PrefabInstanceComponent } from "./prefabInstanceComponent.js";

export class TransformComponent extends BaseComponent {
	public type: ComponentType.Transform = ComponentType.Transform;
	public codeType: string = "Transform";

	public gameObject: string;
	public parent: string;

	private _children: string[];
	public get children() {
		if (this.strippedSourceObject) {
			const pfInst = this.prefab.getComponent<PrefabInstanceComponent>(this.prefabInstance, ComponentType.PrefabInstance);
			const refedComp = pfInst.sourcePrefab.getComponent<TransformComponent>(this.strippedSourceObject.fileId, ComponentType.Transform);

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

	public position: Vector3;
	public rotation: Quaternion;
	public scale: Vector3;

	public buildFromRaw(tfComponent: RawComponent): void {
		assert(tfComponent.type == ComponentType.Transform || tfComponent.type == ComponentType.RectTransform, "Expected Transform component type");

		this.id = tfComponent.id;

		if (tfComponent.stripped) {
			this.buildFromRawStripped(tfComponent);
			return;
		}

		this.gameObject = tfComponent.content.match(/m_GameObject: {fileID: (\d+)}/)[1];
		const parentMatch = tfComponent.content.match(/m_Parent: {fileID: (\d+)}/);
		this.parent = parentMatch ? parentMatch[1] : null;

		const childrenBlock = tfComponent.content.match(/m_Children:((?:\n  - {fileID: \d+})*)/)[1];
		this.children = [...childrenBlock.matchAll(/fileID: (\d+)/g)].map(m => m[1]);

		const positionMatch = tfComponent.content.match(/m_LocalPosition: {x: ([\d.\-e]+), y: ([\d.\-e]+), z: ([\d.\-e]+)}/);
		const rotationMatch = tfComponent.content.match(/m_LocalRotation: {x: ([\d.\-e]+), y: ([\d.\-e]+), z: ([\d.\-e]+), w: ([\d.\-e]+)}/);
		const scaleMatch = tfComponent.content.match(/m_LocalScale: {x: ([\d.\-e]+), y: ([\d.\-e]+), z: ([\d.\-e]+)}/);

		this.position = {
			x: parseFloat(positionMatch[1]),
			y: parseFloat(positionMatch[2]),
			z: parseFloat(positionMatch[3])
		};

		this.rotation = {
			x: parseFloat(rotationMatch[1]),
			y: parseFloat(rotationMatch[2]),
			z: parseFloat(rotationMatch[3]),
			w: parseFloat(rotationMatch[4])
		};

		this.scale = {
			x: parseFloat(scaleMatch[1]),
			y: parseFloat(scaleMatch[2]),
			z: parseFloat(scaleMatch[3])
		};
	}

	public getRef(): string {
		if (this.strippedSourceObject) {
			const pfInst = this.prefab.getComponent<PrefabInstanceComponent>(this.prefabInstance, ComponentType.PrefabInstance);

			return `((Transform)${pfInst.getRef()}.componentFileIdMap[${this.strippedSourceObject.fileId}])`;
		}

		return `transform${this.id}`;
	}

	public getCtor(): string {
		if (this.strippedSourceObject) return "";

		if (this.scale.x == 0 || this.scale.y == 0 || this.scale.z == 0) {
			console.log(`${this} has zero scale, setting to 1`);
			this.scale = { x: 1, y: 1, z: 1 };
		}

		const ref = this.getRef();
		let result = `var ${ref} = new Transform();\n`;

		return result;
	}

	public getSetupCode(): string {
		if (this.strippedSourceObject) return "";

		let result = ``;
		// this.children.forEach(childId => {
		// 	const child = this.prefab.getComponent(childId);
		// 	switch (child.type) {
		// 		case ComponentType.Transform:
		// 			result += `${child.getRef()}.parent = ${this.getRef()};\n`;
		// 			break;
		// 		case ComponentType.PrefabInstance:
		// 			const pfInstRoot = child.sourcePrefab.root;
		// 			const rootTf = child.sourcePrefab.components.find(c => c.type == ComponentType.Transform && c.gameObject == pfInstRoot.id);

		// 			result += `((Transform)${child.getRef()}.componentFileIdMap[${rootTf.id}]).parent = ${this.getRef()};\n`;
		// 			break;
		// 	}
		// });
		result += "// Children: " + this.children.join(", ") + "\n";

		const parent = this.prefab.components.find(c => c.type == ComponentType.Transform && c.children.includes(this.id));
		if (parent) {
			result += `${this.getRef()}.parent = ${parent.getRef()};\n`;
		}

		const ref = this.getRef();
		result += `${ref}.localPosition = new Vector3(${this.position.x}f, ${this.position.y}f, ${this.position.z}f);\n`;
		result += `${ref}.localRotation = new Quaternion(${this.rotation.x}f, ${this.rotation.y}f, ${this.rotation.z}f, ${this.rotation.w}f);\n`;
		result += `${ref}.scale = new Vector3(${this.scale.x}f, ${this.scale.y}f, ${this.scale.z}f);\n`;

		return result;
	}

	public toString(): string {
		return `TransformComponent(id: ${this.id}, go: ${this.gameObject})`;
	}
}
