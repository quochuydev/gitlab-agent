import { readdir, readFile } from "fs/promises";
import { join, extname } from "path";
import { createPinoLogger } from "@voltagent/logger";
import { configuration } from "./configulation";

// Create logger for guidelines scanner
const logger = createPinoLogger({
  name: "guidelines-scanner",
  level: configuration.logging.level as any,
});

export interface GuidelineContent {
  category: string;
  filename: string;
  content: string;
  language?: string;
}

export class GuidelinesScanner {
  private guidelinesDir: string;
  private cache: Map<string, GuidelineContent[]> = new Map();

  constructor(guidelinesDir: string = configuration.guidelines.directory) {
    this.guidelinesDir = guidelinesDir;
    logger.debug("Guidelines scanner initialized", { guidelinesDir });
  }

  /**
   * Scan all guidelines and return relevant ones for the given language
   */
  async getGuidelinesForLanguage(
    language: string
  ): Promise<GuidelineContent[]> {
    const cacheKey = language.toLowerCase();
    logger.debug("Getting guidelines for language", { language, cacheKey });

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      logger.debug("Returning cached guidelines", {
        language,
        count: cached.length,
      });
      return cached;
    }

    logger.debug("Scanning all guidelines for language filtering");
    const allGuidelines = await this.scanAllGuidelines();

    // Filter guidelines relevant to the language
    const relevantGuidelines = allGuidelines.filter((guideline) => {
      const category = guideline.category.toLowerCase();
      const lang = language.toLowerCase();

      return (
        category === lang ||
        category === "security" ||
        category === "performance" ||
        (lang === "ts" && category === "typescript") ||
        (lang === "tsx" && category === "typescript") ||
        (lang === "js" && category === "javascript") ||
        (lang === "jsx" && category === "javascript") ||
        (lang === "py" && category === "python")
      );
    });

    logger.debug("Filtered guidelines for language", {
      language,
      totalGuidelines: allGuidelines.length,
      relevantCount: relevantGuidelines.length,
      relevantCategories: relevantGuidelines.map((g) => g.category),
    });

    this.cache.set(cacheKey, relevantGuidelines);
    return relevantGuidelines;
  }

  /**
   * Scan all guidelines in the directory
   */
  async scanAllGuidelines(): Promise<GuidelineContent[]> {
    const guidelines: GuidelineContent[] = [];

    logger.debug("Starting to scan all guidelines", {
      guidelinesDir: this.guidelinesDir,
    });

    try {
      const categories = await readdir(this.guidelinesDir, {
        withFileTypes: true,
      });
      logger.debug("Found categories", {
        categoriesCount: categories.length,
        categories: categories.map((c) => c.name),
      });

      for (const category of categories) {
        if (category.isDirectory()) {
          const categoryPath = join(this.guidelinesDir, category.name);
          logger.debug("Scanning category directory", {
            category: category.name,
            categoryPath,
          });

          const files = await readdir(categoryPath);
          const markdownFiles = files.filter((f) => extname(f) === ".md");

          logger.debug("Found markdown files in category", {
            category: category.name,
            totalFiles: files.length,
            markdownFiles: markdownFiles.length,
            files: markdownFiles,
          });

          for (const filename of markdownFiles) {
            const filePath = join(categoryPath, filename);
            logger.debug("Reading guideline file", {
              category: category.name,
              filename,
              filePath,
            });

            try {
              const content = await readFile(filePath, "utf-8");

              guidelines.push({
                category: category.name,
                filename,
                content,
                language: this.extractLanguageFromCategory(category.name),
              });

              logger.debug("Successfully loaded guideline", {
                category: category.name,
                filename,
                contentLength: content.length,
              });
            } catch (fileError) {
              logger.warn("Failed to read guideline file", {
                category: category.name,
                filename,
                filePath,
                error:
                  fileError instanceof Error
                    ? fileError.message
                    : "Unknown error",
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error("Failed to scan guidelines directory", {
        guidelinesDir: this.guidelinesDir,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    logger.info("Completed scanning guidelines", {
      guidelinesDir: this.guidelinesDir,
      totalGuidelines: guidelines.length,
      categories: [...new Set(guidelines.map((g) => g.category))],
    });

    return guidelines;
  }

  /**
   * Get specific guidelines by category
   */
  async getGuidelinesByCategory(category: string): Promise<GuidelineContent[]> {
    const allGuidelines = await this.scanAllGuidelines();
    return allGuidelines.filter(
      (g) => g.category.toLowerCase() === category.toLowerCase()
    );
  }

  /**
   * Format guidelines for use in prompts
   */
  formatGuidelinesForPrompt(guidelines: GuidelineContent[]): string {
    if (guidelines.length === 0) {
      return "";
    }

    const sections = guidelines.map((guideline) => {
      return `## ${guideline.category.toUpperCase()}: ${
        guideline.filename
      }\n\n${guideline.content}`;
    });

    return `
# CODE REVIEW GUIDELINES

Use these guidelines to review the code:

${sections.join("\n\n---\n\n")}

Please follow these guidelines when reviewing code and flag any violations or improvements based on the examples above.
`;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Extract language from category name
   */
  private extractLanguageFromCategory(category: string): string | undefined {
    const languageMap: Record<string, string> = {
      javascript: "js",
      typescript: "ts",
      python: "py",
    };

    return languageMap[category.toLowerCase()];
  }

  /**
   * Get all available categories
   */
  async getAvailableCategories(): Promise<string[]> {
    try {
      const entries = await readdir(this.guidelinesDir, {
        withFileTypes: true,
      });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (error) {
      console.warn("Failed to get categories:", error);
      return [];
    }
  }
}
