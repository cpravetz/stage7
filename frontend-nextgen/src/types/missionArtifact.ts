export type ArtifactPurpose = 'workproduct' | 'deliverable' | 'execution-outcome';

export interface MissionArtifact {
  id?: string;
  name?: string;
  type?: string;
  mediaType?: string;
  mimeType?: string;
  contentType?: string;
  content?: unknown;
  data?: unknown;
  contentEncoding?: 'base64' | 'utf-8' | string;
  url?: string;
  purpose?: ArtifactPurpose | string;
  isDeliverable?: boolean;
  status?: string;
  visibility?: 'user' | 'agent' | 'internal' | string;
  artifactId?: string;
  logicalId?: string;
  lineageId?: string;
  version?: string | number;
  versionOf?: string;
  isLatest?: boolean;
  createdAt?: string;
  phaseId?: string;
  phaseName?: string;
  taskId?: string;
  taskTitle?: string;
  taskStatus?: string;
}

export interface MissionArtifactVersionGroup {
  key: string;
  artifacts: MissionArtifact[];
  latest: MissionArtifact;
}

export type ArtifactMediaCategory = 'document' | 'image' | 'audio' | 'video' | 'pdf' | 'other';

export function getArtifactMediaCategory(artifact: MissionArtifact): ArtifactMediaCategory {
  const mimeType = getArtifactMimeType(artifact);
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml')) return 'document';
  return 'other';
}

export function groupMissionArtifactVersions(artifacts: MissionArtifact[]): MissionArtifactVersionGroup[] {
  const artifactById = new Map(
    artifacts.filter((artifact): artifact is MissionArtifact & { id: string } => Boolean(artifact.id))
      .map((artifact) => [artifact.id, artifact]),
  );
  const referencedIds = new Set(artifacts.map((artifact) => artifact.versionOf).filter(
    (id): id is string => Boolean(id),
  ));
  const groups = new Map<string, MissionArtifact[]>();
  artifacts.forEach((artifact, index) => {
    const parent = artifact.versionOf ? artifactById.get(artifact.versionOf) : undefined;
    const lineageId = parent
      ? getArtifactLineageId(parent) || `id:${parent.id}`
      : artifact.versionOf
        ? `id:${artifact.versionOf}`
        : getArtifactLineageId(artifact) || (artifact.id && referencedIds.has(artifact.id) ? `id:${artifact.id}` : undefined);
    const key = lineageId ? `lineage:${lineageId}` : `single:${artifact.id || index}`;
    const group = groups.get(key) || [];
    group.push(artifact);
    groups.set(key, group);
  });
  return [...groups].map(([key, versions]) => {
    const sorted = versions.slice().sort((left, right) => {
      const leftVersion = Number(left.version);
      const rightVersion = Number(right.version);
      if (Number.isFinite(leftVersion) && Number.isFinite(rightVersion)) return leftVersion - rightVersion;
      if (left.isLatest !== right.isLatest) return left.isLatest ? 1 : -1;
      return (left.createdAt || '').localeCompare(right.createdAt || '');
    });
    return { key, artifacts: sorted, latest: sorted[sorted.length - 1] };
  });
}

export function getArtifactPurpose(artifact: MissionArtifact): ArtifactPurpose {
  if (artifact.status === 'blocked') return 'execution-outcome';
  if (
    typeof artifact.content === 'string'
    && /^\s*(?:\*\*)?Blocker(?:\*\*)?\s*:/i.test(artifact.content)
  ) return 'execution-outcome';
  if (artifact.purpose === 'execution-outcome') return 'execution-outcome';
  if (artifact.purpose === 'deliverable' || artifact.isDeliverable === true) return 'deliverable';
  return 'workproduct';
}

export function getArtifactMimeType(artifact: MissionArtifact): string {
  const declared = artifact.mediaType || artifact.mimeType || artifact.contentType
    || (artifact.type?.includes('/') ? artifact.type : undefined);
  if (declared) return declared;
  const extension = artifact.name?.split('.').pop()?.toLowerCase();
  const knownTypes: Record<string, string> = {
    csv: 'text/csv',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    json: 'application/json',
    md: 'text/markdown',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    pdf: 'application/pdf',
    png: 'image/png',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    wav: 'audio/wav',
    webp: 'image/webp',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xml: 'application/xml',
    zip: 'application/zip',
  };
  if (extension && knownTypes[extension]) return knownTypes[extension];
  if (artifact.contentEncoding === 'base64') return 'application/octet-stream';
  if (typeof artifact.content === 'string') return 'text/plain';
  if (artifact.content !== undefined || artifact.data !== undefined) return 'application/json';
  return 'application/octet-stream';
}

export function getArtifactLineageId(artifact: MissionArtifact): string | undefined {
  return artifact.artifactId || artifact.logicalId || artifact.lineageId || artifact.versionOf;
}

export function getArtifactLabel(artifact: MissionArtifact, index: number, versionCount: number): string {
  if (artifact.version !== undefined) return `Version ${artifact.version}`;
  if (versionCount > 1) return `Revision ${index + 1}`;
  return 'Current';
}
