import {
  parseSpatialArtefact,
  type SpatialArtefact,
  type SpatialRegion,
} from '@electronic-artefacts/spatial-artefact-schema';

export * from './topology.js';

export type ProjectSourceAsset = {
  name: string;
  format: 'glb';
  mimeType: 'model/gltf-binary';
  fileSize?: number;
  importerVersion?: string;
  integrity: { algorithm: 'sha256'; hash: string };
  provenance?: {
    sourceFormat?: 'glb';
    originalFileName?: string;
    mimeType?: string;
    fileSize?: number;
    sha256?: string;
    importedAt?: string;
    importerVersion?: string;
  };
};
export type SelectionTarget = {
  mesh: string;
  primitive?: number;
  canonicalMeshId?: string;
  canonicalPrimitiveId?: string;
  canonicalMaterialId?: string;
  faces: number[];
};
export type SelectionSet = { id: string; source: 'click' | 'manual'; targets: SelectionTarget[] };
export type EditableRegion = SpatialRegion;
export type WorkspaceProject = {
  version: '0.2-draft';
  source: ProjectSourceAsset;
  metadata: { id: string; title: string; payloadSrc: string };
  regions: EditableRegion[];
  selections: SelectionSet[];
  activeSelectionId?: string;
  editor: { isDirty: boolean; camera?: { position: number[]; target: number[] } };
};

const clone = <T>(value: T): T => structuredClone(value);
export function createWorkspaceProject(
  source: ProjectSourceAsset,
  metadata?: Partial<WorkspaceProject['metadata']>,
): WorkspaceProject {
  return {
    version: '0.2-draft',
    source,
    metadata: {
      id: metadata?.id ?? source.name.replace(/\.glb$/i, '').replace(/[^\w.-]/g, '-'),
      title: metadata?.title ?? source.name.replace(/\.glb$/i, ''),
      payloadSrc: metadata?.payloadSrc ?? './model.glb',
    },
    regions: [],
    selections: [],
    editor: { isDirty: false },
  };
}
export function compileSpatialArtefact(project: WorkspaceProject): SpatialArtefact {
  return parseSpatialArtefact({
    artifact: 'spatial',
    specVersion: '0.1.0',
    metadata: {
      id: project.metadata.id,
      title: project.metadata.title,
      triangleMapping: { finalGlb: true },
    },
    payload: {
      type: 'model/gltf-binary',
      src: project.metadata.payloadSrc,
      integrity: project.source.integrity,
    },
    regions: project.regions.map((region) => ({ ...region, tags: [...region.tags] })),
  });
}
export function serializeWorkspaceProject(project: WorkspaceProject) {
  return JSON.stringify(project);
}
export function deserializeWorkspaceProject(value: string): WorkspaceProject {
  const project = JSON.parse(value) as WorkspaceProject;
  if (project.version !== '0.2-draft' || project.source?.format !== 'glb')
    throw new Error('Invalid WorkspaceProject snapshot.');
  return project;
}

export interface ProjectCommand {
  label: string;
  execute(project: WorkspaceProject): WorkspaceProject;
  undo(project: WorkspaceProject): WorkspaceProject;
}
export class ProjectHistory {
  private undoStack: ProjectCommand[] = [];
  private redoStack: ProjectCommand[] = [];
  constructor(
    private state: WorkspaceProject,
    readonly limit = 100,
  ) {}
  get project() {
    return this.state;
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  execute(command: ProjectCommand) {
    this.state = command.execute(this.state);
    this.state.editor.isDirty = true;
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    return this.state;
  }
  undo() {
    const command = this.undoStack.pop();
    if (!command) return this.state;
    this.state = command.undo(this.state);
    this.state.editor.isDirty = true;
    this.redoStack.push(command);
    return this.state;
  }
  redo() {
    const command = this.redoStack.pop();
    if (!command) return this.state;
    this.state = command.execute(this.state);
    this.state.editor.isDirty = true;
    this.undoStack.push(command);
    return this.state;
  }
  markSaved() {
    this.state = clone(this.state);
    this.state.editor.isDirty = false;
    return this.state;
  }
}
function replace(project: WorkspaceProject, update: (next: WorkspaceProject) => void) {
  const next = clone(project);
  update(next);
  return next;
}
export const commands = {
  createRegion(region: EditableRegion): ProjectCommand {
    return {
      label: 'Create region',
      execute: (project) => replace(project, (next) => next.regions.push(clone(region))),
      undo: (project) =>
        replace(project, (next) => {
          next.regions = next.regions.filter((item) => item.id !== region.id);
        }),
    };
  },
  deleteRegion(id: string, previous?: EditableRegion): ProjectCommand {
    let removed = previous;
    return {
      label: 'Delete region',
      execute: (project) =>
        replace(project, (next) => {
          removed ??= next.regions.find((region) => region.id === id);
          next.regions = next.regions.filter((region) => region.id !== id);
        }),
      undo: (project) =>
        replace(project, (next) => {
          if (removed) next.regions.push(clone(removed));
        }),
    };
  },
  updateRegionMetadata(
    id: string,
    update: Pick<EditableRegion, 'id' | 'label' | 'tags'>,
  ): ProjectCommand {
    let previous: Pick<EditableRegion, 'id' | 'label' | 'tags'> | undefined;
    return {
      label: 'Update region metadata',
      execute: (project) =>
        replace(project, (next) => {
          const region = next.regions.find((item) => item.id === id);
          if (!region) return;
          if (update.id !== id && next.regions.some((item) => item.id === update.id)) {
            throw new Error('Region IDs must be unique.');
          }
          previous ??= { id: region.id, label: region.label, tags: [...region.tags] };
          region.id = update.id;
          region.label = update.label;
          region.tags = [...update.tags];
        }),
      undo: (project) =>
        replace(project, (next) => {
          const region = next.regions.find((item) => item.id === update.id);
          if (region && previous) {
            region.id = previous.id;
            region.label = previous.label;
            region.tags = [...previous.tags];
          }
        }),
    };
  },
  setSelection(selection: SelectionSet): ProjectCommand {
    let previous: SelectionSet[] | undefined;
    return {
      label: 'Set selection',
      execute: (project) =>
        replace(project, (next) => {
          previous ??= clone(next.selections);
          next.selections = [clone(selection)];
          next.activeSelectionId = selection.id;
        }),
      undo: (project) =>
        replace(project, (next) => {
          next.selections = clone(previous ?? []);
          next.activeSelectionId = next.selections[0]?.id;
        }),
    };
  },
  addFacesToSelection(id: string, target: SelectionTarget): ProjectCommand {
    return selectionMutation(id, target, true);
  },
  removeFacesFromSelection(id: string, target: SelectionTarget): ProjectCommand {
    return selectionMutation(id, target, false);
  },
  clearSelection(): ProjectCommand {
    let previous: SelectionSet[] | undefined;
    return {
      label: 'Clear selection',
      execute: (project) =>
        replace(project, (next) => {
          previous ??= clone(next.selections);
          next.selections = [];
          delete next.activeSelectionId;
        }),
      undo: (project) =>
        replace(project, (next) => {
          next.selections = clone(previous ?? []);
          next.activeSelectionId = next.selections[0]?.id;
        }),
    };
  },
};
function selectionMutation(id: string, target: SelectionTarget, add: boolean): ProjectCommand {
  let previous: SelectionSet[] | undefined;
  return {
    label: add ? 'Add faces to selection' : 'Remove faces from selection',
    execute: (project) =>
      replace(project, (next) => {
        previous ??= clone(next.selections);
        const selection = next.selections.find((item) => item.id === id);
        if (!selection) return;
        const match = selection.targets.find(
          (item) => item.mesh === target.mesh && item.primitive === target.primitive,
        );
        if (!match && add) selection.targets.push(clone(target));
        else if (match) {
          const values = new Set(match.faces);
          target.faces.forEach((face) => (add ? values.add(face) : values.delete(face)));
          match.faces = [...values].sort((a, b) => a - b);
        }
      }),
    undo: (project) =>
      replace(project, (next) => {
        next.selections = clone(previous ?? []);
      }),
  };
}
