import * as fs from "fs";

export const getFileContent = (filePath: string) => {
  return fs.readFileSync(filePath, "utf-8");
};
