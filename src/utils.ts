import * as fs from "fs";

export const getFileContent = (filePath: string): string => {
  return fs.readFileSync(filePath, "utf-8");
};
