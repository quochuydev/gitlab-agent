import { Gitlab } from '@gitbeaker/rest';
import { createPinoLogger } from '@voltagent/logger';
import { configuration } from './configulation';

// Create logger for GitLab service
const logger = createPinoLogger({
  name: 'gitlab-service',
  level: configuration.logging.level as any,
});

export interface GitLabConfig {
  host: string;
  token: string;
}

export interface RepositoryFile {
  path: string;
  content: string;
  encoding: string;
  size: number;
  lastCommitId: string;
}

export interface MergeRequestDetails {
  id: number;
  title: string;
  description: string;
  author: {
    name: string;
    email: string;
  };
  sourceBranch: string;
  targetBranch: string;
  status: string;
  changedFiles?: RepositoryFile[];
}

export class GitLabService {
  private api: InstanceType<typeof Gitlab>;

  constructor(config?: GitLabConfig) {
    const gitlabUrl = config?.host || configuration.gitlab.url;
    const gitlabToken = config?.token || configuration.gitlab.token;

    logger.debug('Initializing GitLab service', {
      url: gitlabUrl,
      tokenProvided: !!gitlabToken,
      configProvided: !!config
    });

    if (!gitlabToken) {
      logger.error('GitLab token is required');
      throw new Error('GitLab token is required. Set GITLAB_TOKEN environment variable or provide in config.');
    }

    this.api = new Gitlab({
      host: gitlabUrl,
      token: gitlabToken,
    });

    logger.info('GitLab service initialized successfully', { url: gitlabUrl });
  }

  /**
   * Fetch a specific file from a GitLab repository
   */
  async getRepositoryFile(
    projectId: string | number,
    filePath: string,
    ref: string = 'main'
  ): Promise<RepositoryFile> {
    logger.debug('Fetching repository file', { projectId, filePath, ref });
    
    try {
      const file = await this.api.RepositoryFiles.show(projectId, filePath, ref);
      
      logger.debug('Repository file fetched successfully', {
        projectId,
        filePath,
        ref,
        size: file.size,
        encoding: file.encoding
      });

      return {
        path: filePath,
        content: Buffer.from(file.content, 'base64').toString('utf-8'),
        encoding: file.encoding,
        size: file.size,
        lastCommitId: file.last_commit_id,
      };
    } catch (error) {
      logger.error('Failed to fetch repository file', {
        projectId,
        filePath,
        ref,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to fetch file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all files from a repository tree
   */
  async getRepositoryTree(
    projectId: string | number,
    ref: string = 'main',
    path: string = ''
  ): Promise<Array<{ path: string; type: string }>> {
    logger.debug('Fetching repository tree', { projectId, ref, path });
    
    try {
      const tree = await this.api.Repositories.tree(projectId, {
        ref,
        path,
        recursive: true,
      });

      logger.debug('Repository tree fetched successfully', {
        projectId,
        ref,
        path,
        itemCount: tree.length
      });

      return tree.map(item => ({
        path: item.path,
        type: item.type,
      }));
    } catch (error) {
      logger.error('Failed to fetch repository tree', {
        projectId,
        ref,
        path,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to fetch repository tree: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get merge request details including changed files
   */
  async getMergeRequest(
    projectId: string | number,
    mergeRequestId: number
  ): Promise<MergeRequestDetails> {
    logger.debug('Fetching merge request', { projectId, mergeRequestId });
    
    try {
      const [mergeRequest, changes] = await Promise.all([
        this.api.MergeRequests.show(projectId, mergeRequestId),
        this.api.MergeRequests.changes(projectId, mergeRequestId)
      ]);

      logger.debug('Merge request data fetched', {
        projectId,
        mergeRequestId,
        title: mergeRequest.title,
        sourceBranch: mergeRequest.source_branch,
        targetBranch: mergeRequest.target_branch,
        changesCount: changes.changes?.length || 0
      });

      const changedFiles: RepositoryFile[] = [];
      
      // Fetch content for each changed file
      for (const change of changes.changes || []) {
        if (change.new_file || !change.deleted_file) {
          try {
            logger.debug('Fetching changed file content', {
              projectId,
              mergeRequestId,
              filePath: change.new_path
            });
            
            const file = await this.getRepositoryFile(
              projectId,
              change.new_path,
              mergeRequest.source_branch
            );
            changedFiles.push(file);
          } catch (error) {
            logger.warn('Could not fetch content for changed file', {
              projectId,
              mergeRequestId,
              filePath: change.new_path,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      logger.info('Merge request fetched successfully', {
        projectId,
        mergeRequestId,
        changedFilesCount: changedFiles.length
      });

      return {
        id: mergeRequest.iid,
        title: mergeRequest.title,
        description: mergeRequest.description || '',
        author: {
          name: mergeRequest.author.name,
          email: mergeRequest.author.email || '',
        },
        sourceBranch: mergeRequest.source_branch,
        targetBranch: mergeRequest.target_branch,
        status: mergeRequest.state,
        changedFiles,
      };
    } catch (error) {
      logger.error('Failed to fetch merge request', {
        projectId,
        mergeRequestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to fetch merge request ${mergeRequestId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get project information
   */
  async getProject(projectId: string | number) {
    try {
      return await this.api.Projects.show(projectId);
    } catch (error) {
      throw new Error(`Failed to fetch project ${projectId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List merge requests for a project
   */
  async listMergeRequests(
    projectId: string | number,
    options: {
      state?: 'opened' | 'closed' | 'merged' | 'all';
      targetBranch?: string;
      sourceBranch?: string;
    } = {}
  ) {
    try {
      return await this.api.MergeRequests.all({
        projectId,
        state: options.state || 'opened',
        target_branch: options.targetBranch,
        source_branch: options.sourceBranch,
      });
    } catch (error) {
      throw new Error(`Failed to list merge requests: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}