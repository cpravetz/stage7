import { useEffect, useMemo, useState } from 'react';
import { getArtifactMimeType, MissionArtifact } from '../types/missionArtifact';

interface MissionArtifactContentProps {
  artifact: MissionArtifact;
}

function artifactBlob(artifact: MissionArtifact, mimeType: string): Blob | undefined {
  const content = artifact.content ?? artifact.data;
  const blobMimeType = mimeType === 'text/html' || mimeType === 'application/xhtml+xml' ? 'text/plain' : mimeType;
  if (content === undefined || content === null) return undefined;
  if (content instanceof Blob) return content;
  if (typeof content === 'string') {
    if (artifact.contentEncoding === 'base64') {
      const binary = atob(content);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new Blob([bytes], { type: blobMimeType });
    }
    return new Blob([content], { type: blobMimeType });
  }
  return new Blob([JSON.stringify(content, null, 2)], { type: blobMimeType });
}

function textContent(artifact: MissionArtifact): string | undefined {
  const content = artifact.content ?? artifact.data;
  if (content === undefined || content === null) return undefined;
  if (typeof content !== 'string') return JSON.stringify(content, null, 2);
  if (artifact.contentEncoding !== 'base64') return content;
  const binary = atob(content);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export default function MissionArtifactContent({ artifact }: MissionArtifactContentProps) {
  const mimeType = useMemo(() => getArtifactMimeType(artifact), [artifact]);
  const [objectUrl, setObjectUrl] = useState<string>();
  const [resourceError, setResourceError] = useState<string>();
  const remoteUrl = artifact.url;
  const fileName = artifact.name || artifact.id || 'artifact';
  const isText = mimeType.startsWith('text/')
    || mimeType === 'application/json'
    || mimeType.endsWith('+json')
    || mimeType === 'application/xml';
  const isActiveDocument = mimeType === 'text/html' || mimeType === 'application/xhtml+xml';
  const previewText = useMemo(() => {
    if (!isText) return undefined;
    try {
      return textContent(artifact);
    } catch {
      return undefined;
    }
  }, [artifact, isText]);

  useEffect(() => {
    setResourceError(undefined);
    if (remoteUrl) {
      setObjectUrl(undefined);
      return;
    }
    try {
      const blob = artifactBlob(artifact, mimeType);
      if (!blob) {
        setObjectUrl(undefined);
        return;
      }
      const nextUrl = URL.createObjectURL(blob);
      setObjectUrl(nextUrl);
      return () => URL.revokeObjectURL(nextUrl);
    } catch (error) {
      setObjectUrl(undefined);
      setResourceError(error instanceof Error ? error.message : 'Unable to read artifact content');
    }
  }, [artifact, mimeType, remoteUrl]);

  const resourceUrl = remoteUrl || objectUrl;
  const openArtifact = () => {
    if (resourceUrl) window.open(resourceUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {resourceError && <div className="error-banner">Could not preview this file: {resourceError}</div>}
      {isText && previewText !== undefined && (
        <pre className="code-block" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {previewText.slice(0, 1200)}
          {previewText.length > 1200 ? '…' : ''}
        </pre>
      )}
      {resourceUrl && mimeType.startsWith('image/') && (
        <img src={resourceUrl} alt={fileName} style={{ maxWidth: '100%', maxHeight: 420, objectFit: 'contain' }} />
      )}
      {resourceUrl && mimeType.startsWith('audio/') && (
        <audio controls preload="metadata" src={resourceUrl}>Audio preview is not supported by this browser.</audio>
      )}
      {resourceUrl && mimeType.startsWith('video/') && (
        <video controls preload="metadata" src={resourceUrl} style={{ maxWidth: '100%', maxHeight: 420 }}>
          Video preview is not supported by this browser.
        </video>
      )}
      {resourceUrl && mimeType === 'application/pdf' && (
        <iframe title={fileName} src={resourceUrl} style={{ width: '100%', height: 420, border: 0 }} />
      )}
      {!isText && !mimeType.startsWith('image/') && !mimeType.startsWith('audio/')
        && !mimeType.startsWith('video/') && mimeType !== 'application/pdf' && (
          <div className="muted">
            {mimeType} · {resourceUrl ? 'Preview unavailable; open or download the original file.' : 'File content is unavailable.'}
          </div>
        )}
      {resourceUrl && (
        <div style={{ display: 'flex', gap: 8 }}>
          {!isActiveDocument && <button type="button" onClick={openArtifact}>Open</button>}
          <button type="button" onClick={() => {
            const link = document.createElement('a');
            link.href = resourceUrl;
            link.download = fileName;
            link.target = '_blank';
            link.rel = 'noreferrer';
            document.body.appendChild(link);
            link.click();
            link.remove();
          }}>Download</button>
        </div>
      )}
    </div>
  );
}
