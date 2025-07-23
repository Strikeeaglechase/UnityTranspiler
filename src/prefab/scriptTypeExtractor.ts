import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";

const extractorUtilPath = "C:/Users/strik/Desktop/Programs/CSharp/ClassTypeExtractor/bin/Debug/net8.0/ClassTypeExtractor.exe";
interface CachedTypeData {
	filePath: string;
	contentHash: string;
	types: TypeData[];
}

const cachePath = "../../typeCache.json";

function loadCache() {
	if (!fs.existsSync(cachePath)) return [];
	const cacheContent = fs.readFileSync(cachePath, "utf8");
	const cachedData = JSON.parse(cacheContent) as CachedTypeData[];

	return cachedData;
}

function updateCache(filePath: string, typeData: TypeData[]) {
	const content = fs.readFileSync(filePath, "utf8");
	const hash = crypto.createHash("sha256").update(content).digest("hex");

	const existingItem = cache.find(item => item.filePath == filePath);
	if (existingItem) {
		existingItem.contentHash = hash;
		existingItem.types = typeData;
	} else {
		cache.push({
			filePath,
			contentHash: hash,
			types: typeData
		});
	}

	fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

function getTypesFromCache(filePath: string): TypeData[] | null {
	const cacheItem = cache.find(item => item.filePath == filePath);
	if (!cacheItem) return null;

	const content = fs.readFileSync(filePath, "utf8");
	const hash = crypto.createHash("sha256").update(content).digest("hex");

	if (cacheItem.contentHash != hash) return null;

	return cacheItem.types;
}

const cache: CachedTypeData[] = loadCache();

export interface TypeData {
	name: string;
	baseClass: string;
	fields: { name: string; type: string }[];
}

export function getScriptTypes(filePath: string): TypeData[] {
	const cachedTypes = getTypesFromCache(filePath);
	if (cachedTypes) return cachedTypes;

	const command = `"${extractorUtilPath}" "${filePath}"`;
	const output = execSync(command, { encoding: "utf8" });
	const types = JSON.parse(output) as TypeData[];

	updateCache(filePath, types);
	return types;
}

export function getAllTypes(): TypeData[] {
	return cache.flatMap(item => item.types);
}

export function getScriptTypeWithBase(className: string) {
	const allTypeData = getAllTypes();
	const baseTypeData = allTypeData.find(type => type.name == className);

	if (!baseTypeData || !baseTypeData.baseClass) return baseTypeData;
	const fullType: TypeData = {
		name: baseTypeData.name,
		baseClass: baseTypeData.baseClass,
		fields: [...baseTypeData.fields]
	};

	let curType = baseTypeData;

	while (curType.baseClass) {
		curType = allTypeData.find(type => type.name == curType.baseClass);
		if (!curType) break;
		fullType.fields.push(...curType.fields);
	}

	return fullType;
}
