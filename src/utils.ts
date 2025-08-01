import fs from "fs";
import path from "path";

export function recursivelyCopyFiles(src: string, dest: string) {
	if (!fs.existsSync(dest)) {
		fs.mkdirSync(dest, { recursive: true });
	}

	const files = fs.readdirSync(src);
	files.forEach(file => {
		const srcPath = path.join(src, file);
		const destPath = path.join(dest, file);

		if (fs.statSync(srcPath).isDirectory()) {
			recursivelyCopyFiles(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	});
}

export function cleanName(name: string) {
	name = name.replaceAll("-", "_").replaceAll(" ", "_");
	return name[0].toUpperCase() + name.slice(1);
}

export function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}
