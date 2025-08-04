import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import { recursivelyCopyFiles } from "./utils.js";

const outputDir = "../build/";
if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true });
fs.mkdirSync(outputDir);

// Transpile unity project
console.log(`Starting transpile`);
const transpilerPath = "C:/Users/strik/Desktop/Programs/Typescript/UnityTranspiler/dist/index.js";
execSync(`node ${transpilerPath} --no-watch`, { stdio: "inherit" });
console.log(`Transpiled Unity project`);

// Build Sim
console.log(`Starting C# project build`);
const aipSimPath = "C:/Users/strik/Desktop/Programs/CSharp/AIPilot";
execSync(`dotnet build ${aipSimPath} -c Release`, { stdio: "inherit" });
console.log(`C# project build complete`);

// Copy sim files in
const simBuild = path.join(aipSimPath, "bin", "Release", "net6.0");
const simFiles = fs.readdirSync(simBuild);
const simOutPath = path.join(outputDir, "AIPSim");
fs.mkdirSync(simOutPath);
simFiles.forEach(file => {
	fs.copyFileSync(path.join(simBuild, file), path.join(simOutPath, file));
});

// Copy map files
const mapFilesPath = "C:/Users/strik/Desktop/AIPilot/Assets/Resources/Map";
const mapOutputPath = path.join(outputDir, "Map");
fs.mkdirSync(mapOutputPath);
const mapExtensions = [".png", ".vtm", ".vts"];
fs.readdirSync(mapFilesPath).forEach(file => {
	if (!mapExtensions.some(ext => file.endsWith(ext))) return;
	fs.copyFileSync(path.join(mapFilesPath, file), path.join(mapOutputPath, file));
});

// Copy AIPProvider
const aipImplementationPath = "C:/Users/strik/Desktop/Programs/CSharp/AIPLoader";
const targetFiles = ["AIPProvider.csproj", "AIPProvider.sln", "onBuild.bat", "rapidValueTesting.bat", "readme.md"];
const aipProviderDir = path.join(outputDir, "AIPProvider");
fs.mkdirSync(aipProviderDir);
targetFiles.forEach(file => {
	const srcPath = path.join(aipImplementationPath, file);
	const destPath = path.join(aipProviderDir, file);
	fs.copyFileSync(srcPath, destPath);
});
recursivelyCopyFiles(path.join(aipImplementationPath, "src"), path.join(aipProviderDir, "src"));

// Copy HC
const hcPath = "C:/Users/strik/Desktop/Programs/Typescript/VTOLLiveViewer/VTOLLiveViewerClient/out/Headless Client-win32-x64";
const hcOutPath = path.join(outputDir, "HeadlessClient");
fs.mkdirSync(hcOutPath);
recursivelyCopyFiles(hcPath, hcOutPath);

// Copy readmes
fs.copyFileSync(path.join(aipImplementationPath, "readme.md"), path.join(outputDir, "aipProvider-readme.md"));
fs.copyFileSync(path.join(aipSimPath, "readme.md"), path.join(outputDir, "aipSim-readme.md"));
fs.copyFileSync(path.join(aipSimPath, "gameinfo.md"), path.join(outputDir, "gameinfo.md"));
