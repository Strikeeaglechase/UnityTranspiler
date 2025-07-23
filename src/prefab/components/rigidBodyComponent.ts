import { BaseComponent, ComponentType, RawComponent, Vector3 } from "./baseComponent.js";

export class RigidBodyComponent extends BaseComponent {
	public type: ComponentType.RigidBody = ComponentType.RigidBody;
	public codeType: string = "Rigidbody";

	public mass: number;
	public drag: number;
	public angularDrag: number;
	public centerOfMass: Vector3;
	public inertiaTensor: Vector3;
	public useGravity: boolean;
	public isKinematic: boolean;

	public buildFromRaw(raw: RawComponent): void {
		super.buildFromRaw(raw);

		this.mass = parseFloat(raw.content.match(/m_Mass: (.+)/)[1]);
		this.drag = parseFloat(raw.content.match(/m_Drag: (.+)/)[1]);
		this.angularDrag = parseFloat(raw.content.match(/m_AngularDrag: (.+)/)[1]);
		this.useGravity = raw.content.includes("m_UseGravity: 1");
		this.isKinematic = raw.content.includes("m_IsKinematic: 1");

		const comMatch = raw.content.match(/m_CenterOfMass: {x: ([\d.\-e]+), y: ([\d.\-e]+), z: ([\d.\-e]+)}/);
		const inertiaMatch = raw.content.match(/m_InertiaTensor: {x: ([\d.\-e]+), y: ([\d.\-e]+), z: ([\d.\-e]+)}/);

		this.centerOfMass = {
			x: parseFloat(comMatch[1]),
			y: parseFloat(comMatch[2]),
			z: parseFloat(comMatch[3])
		};

		this.inertiaTensor = {
			x: parseFloat(inertiaMatch[1]),
			y: parseFloat(inertiaMatch[2]),
			z: parseFloat(inertiaMatch[3])
		};
	}

	public getRef(): string {
		return `rigidBody${this.id}`;
	}

	public getCtor(): string {
		return `var ${this.getRef()} = new Rigidbody();\n`;
	}

	public getSetupCode(): string {
		let result = `${this.getRef()}.mass = ${this.mass}f;\n`;
		result += `${this.getRef()}.drag = ${this.drag}f;\n`;
		result += `${this.getRef()}.angularDrag = ${this.angularDrag}f;\n`;
		result += `${this.getRef()}.centerOfMass = new Vector3(${this.centerOfMass.x}f, ${this.centerOfMass.y}f, ${this.centerOfMass.z}f);\n`;
		result += `${this.getRef()}.inertiaTensor = new Vector3(${this.inertiaTensor.x}f, ${this.inertiaTensor.y}f, ${this.inertiaTensor.z}f);\n`;
		result += `${this.getRef()}.useGravity = ${this.useGravity};\n`;
		result += `${this.getRef()}.isKinematic = ${this.isKinematic};\n`;

		return result;
	}
}
