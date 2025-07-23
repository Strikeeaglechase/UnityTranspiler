import { assert } from "../../index.js";
import { Prefab } from "../prefab.js";
import { GameObjectComponent } from "./gameObjectComponent.js";
import { PrefabInstanceComponent } from "./prefabInstanceComponent.js";
import { RigidBodyComponent } from "./rigidBodyComponent.js";
import { SceneRootsComponent } from "./sceneRootsComponent.js";
import { MonoBehaviourComponent } from "./scriptComponent.js";
import { TransformComponent } from "./transformComponent.js";

export enum ComponentType {
	GameObject = 1,
	Transform = 4,
	RectTransform = 224,
	MonoBehaviour = 114,
	PrefabInstance = 1001,
	SceneRoots = 1660057539,
	RigidBody = 54
	// MeshFilter = 33,
	// MeshRenderer = 23
}

export const componentTypeToMap: Record<ComponentType, "gameObjectFileIdMap" | "componentFileIdMap"> = {
	[ComponentType.GameObject]: "gameObjectFileIdMap",
	[ComponentType.PrefabInstance]: "gameObjectFileIdMap",
	[ComponentType.SceneRoots]: "gameObjectFileIdMap",
	[ComponentType.Transform]: "componentFileIdMap",
	[ComponentType.RectTransform]: "componentFileIdMap",
	[ComponentType.MonoBehaviour]: "componentFileIdMap",
	[ComponentType.RigidBody]: "componentFileIdMap"
};

export interface Vector3 {
	x: number;
	y: number;
	z: number;
}

export interface Quaternion extends Vector3 {
	w: number;
}

export interface RawComponent {
	type: number;
	id: string;
	name: string;
	content: string;
	stripped: boolean;
}

export abstract class BaseComponent {
	public abstract type: ComponentType;
	public abstract codeType: string;
	public id: string;
	public prefab: Prefab;

	public strippedSourceObject: { fileId: string; guid: string };
	public prefabInstance: string;

	constructor(prefab: Prefab) {
		this.prefab = prefab;
	}

	public buildFromRaw(raw: RawComponent): void {
		assert(raw.type == this.type, `Expected component type ${ComponentType[this.type]} but got ${ComponentType[raw.type]}`);

		this.id = raw.id;

		if (raw.stripped) this.buildFromRawStripped(raw);
	}

	protected buildFromRawStripped(tfComponent: RawComponent): void {
		const sourceObjectMatch = tfComponent.content.match(/m_CorrespondingSourceObject: {fileID: (\d+), guid: (\w+), type: 3}/);
		const prefabInstanceMatch = tfComponent.content.match(/m_PrefabInstance: {fileID: (\d+)}/);

		this.strippedSourceObject = {
			fileId: sourceObjectMatch[1],
			guid: sourceObjectMatch[2]
		};
		this.prefabInstance = prefabInstanceMatch[1];
	}

	public abstract getRef(): string;
	public abstract getCtor(): string;
	public abstract getSetupCode(): string;

	public toString(): string {
		return `${this.type}(id: ${this.id})`;
	}
}

export type Component = GameObjectComponent | TransformComponent | MonoBehaviourComponent | SceneRootsComponent | PrefabInstanceComponent | RigidBodyComponent;
