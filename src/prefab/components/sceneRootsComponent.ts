import { BaseComponent, ComponentType, RawComponent } from "./baseComponent.js";
import { GameObjectComponent } from "./gameObjectComponent.js";

export class SceneRootsComponent extends BaseComponent {
	public type: ComponentType.SceneRoots = ComponentType.SceneRoots;
	public codeType: string = "SCENE_ROOTS_INVALID_REF";

	public name: string = `SceneRoots`;
	public children: string[] = [];
	public rootGameObject: GameObjectComponent;

	public buildFromRaw(raw: RawComponent): void {
		super.buildFromRaw(raw);

		const childrenMatch = raw.content.matchAll(/{fileID: (\d+)}/g);
		this.children = [...childrenMatch].map(match => match[1]);
	}

	public getRef(): string {
		return this.rootGameObject.getRef();
	}

	public getCtor(): string {
		return "";
	}

	public getSetupCode(): string {
		return "";
	}
}
