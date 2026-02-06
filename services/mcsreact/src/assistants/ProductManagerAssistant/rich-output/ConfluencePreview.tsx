// services/mcsreact/src/pm-assistant/rich-output/ConfluencePreview.tsx
import React, { useState } from 'react';
import { Card, CardHeader, CardContent, CardActions, Button, Typography, Box, Chip, Avatar } from '@mui/material/index.js';
import { ConfluencePreviewProps } from '../types';
import ReactMarkdown from 'react-markdown';

const ConfluencePreview: React.FC<ConfluencePreviewProps> = ({
  title,
  space,
  author,
  lastUpdated,
  content,
  link,
  onView,
  onEdit,
  onShare
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);

  // Truncate content for preview
  const previewContent = showFullContent ? content : content.substring(0, 300) + (content.length > 300 ? '...' : '');

  // Format date
  const formatDate = (date: Date | string) => {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleString();
  };

  return (
    <Card sx={{ mb: 2, boxShadow: 3 }}>
      <CardHeader
        title={title}
        subheader={
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center">
              <Chip label={space} size="small" />
              <Typography variant="caption" sx={{ ml: 1 }}>
                Last updated: {formatDate(lastUpdated)} by {author}
              </Typography>
            </Box>
          </Box>
        }
      />
      <CardContent>
        <Box mb={2}>
          <ReactMarkdown>
            {previewContent}
          </ReactMarkdown>
          {!showFullContent && content.length > 300 && (
            <Button
              size="small"
              onClick={() => setShowFullContent(true)}
              sx={{ mt: 1 }}
            >
              Read More
            </Button>
          )}
        </Box>
      </CardContent>
      <CardActions sx={{ justifyContent: 'flex-end' }}>
        {link && (
          <Button
            variant="outlined"
            size="small"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              if (onView) onView();
              window.open(link, '_blank');
            }}
          >
            View Full Document
          </Button>
        )}
        {onEdit && (
          <Button
            variant="outlined"
            size="small"
            onClick={onEdit}
          >
            Edit
          </Button>
        )}
        {onShare && (
          <Button
            variant="outlined"
            size="small"
            onClick={onShare}
          >
            Share
          </Button>
        )}
      </CardActions>
    </Card>
  );
};

export default ConfluencePreview;

