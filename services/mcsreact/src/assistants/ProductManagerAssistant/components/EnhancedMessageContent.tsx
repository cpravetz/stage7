// services/mcsreact/src/pm-assistant/components/EnhancedMessageContent.tsx
import React from 'react';
import { ConversationMessage } from '@cktmcs/sdk';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'prism-react-renderer';
import { Typography, Link, Box, Paper, Divider } from '@mui/material/index.js';
import JiraTicketCard from '../rich-output/JiraTicketCard';
import DataAnalysisChart from '../rich-output/DataAnalysisChart';
import ConfluencePreview from '../rich-output/ConfluencePreview';

interface EnhancedMessageContentProps {
  message: ConversationMessage;
}

const EnhancedMessageContent: React.FC<EnhancedMessageContentProps> = ({ message }) => {
  const content = message.content as any;

  // Custom components for markdown rendering
  const markdownComponents = {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          language={match[1]}
          style={undefined}
          PreTag="div"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    a({ node, href, children, ...props }: any) {
      return (
        <Link href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </Link>
      );
    },
    h1({ node, children, ...props }: any) {
      return <Typography variant="h4" gutterBottom {...props}>{children}</Typography>;
    },
    h2({ node, children, ...props }: any) {
      return <Typography variant="h5" gutterBottom {...props}>{children}</Typography>;
    },
    h3({ node, children, ...props }: any) {
      return <Typography variant="h6" gutterBottom {...props}>{children}</Typography>;
    },
    p({ node, children, ...props }: any) {
      return <Typography paragraph {...props}>{children}</Typography>;
    },
    ul({ node, children, ...props }: any) {
      return <Typography component="ul" {...props}>{children}</Typography>;
    },
    ol({ node, children, ...props }: any) {
      return <Typography component="ol" {...props}>{children}</Typography>;
    },
    li({ node, children, ...props }: any) {
      return <Typography component="li" {...props}>{children}</Typography>;
    },
    table({ node, children, ...props }: any) {
      return (
        <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', mb: 2 }} {...props}>
          {children}
        </Box>
      );
    },
    th({ node, children, ...props }: any) {
      return (
        <Box component="th" sx={{ border: '1px solid #ddd', padding: 1, backgroundColor: theme.palette.background.paper }} {...props}>
          {children}
        </Box>
      );
    },
    td({ node, children, ...props }: any) {
      return (
        <Box component="td" sx={{ border: '1px solid #ddd', padding: 1 }} {...props}>
          {children}
        </Box>
      );
    }
  };

  const renderToolOutput = () => {
    if (message.type === 'tool_output') {
      const toolData = content;

      // Detect tool type based on content structure
      if (toolData.toolType === 'jira') {
        return (
          <JiraTicketCard
            ticketKey={toolData.ticketKey || toolData.key}
            title={toolData.title || toolData.summary}
            status={toolData.status || 'Unknown'}
            type={toolData.type || 'Task'}
            assignee={toolData.assignee || { name: 'Unassigned' }}
            summary={toolData.description || toolData.summary || 'No description'}
            priority={toolData.priority || 'Medium'}
            dueDate={toolData.dueDate}
            createdDate={toolData.createdDate || new Date()}
            link={toolData.link || toolData.url || '#'}
          />
        );
      }

      if (toolData.toolType === 'data_analysis') {
        return (
          <DataAnalysisChart
            title={toolData.title || 'Data Analysis'}
            data={toolData.data || []}
            chartType={toolData.chartType || 'bar'}
            xAxisLabel={toolData.xAxisLabel || 'Items'}
            yAxisLabel={toolData.yAxisLabel || 'Values'}
            insights={toolData.insights || []}
          />
        );
      }

      if (toolData.toolType === 'confluence') {
        return (
          <ConfluencePreview
            title={toolData.title || 'Document'}
            space={toolData.space || 'Unknown Space'}
            author={toolData.author || 'Unknown Author'}
            lastUpdated={toolData.lastUpdated || new Date()}
            content={toolData.content || 'No content available'}
            link={toolData.link || toolData.url || '#'}
          />
        );
      }

      // Fallback for unknown tool types
      return (
        <Paper sx={{ p: 2, backgroundColor: theme.palette.background.paper, overflowX: 'auto' }}>
          <Typography variant="subtitle2" gutterBottom>
            Tool Output:
          </Typography>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {JSON.stringify(toolData, null, 2)}
          </pre>
        </Paper>
      );
    }

    return null;
  };

  // Component to render structured documentation
  const DocumentationViewer: React.FC<{ data: any }> = ({ data }) => {
    return (
      <Paper sx={{ p: 2, mt: 1 }}>
        <Typography variant="h5" gutterBottom>{data.title}</Typography>
        <Typography paragraph>{data.description}</Typography>

        {data.schema_arguments && data.schema_arguments.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6">Arguments</Typography>
            {data.schema_arguments.map((arg: any, index: number) => (
              <Box key={index} sx={{ ml: 2, mb: 1 }}>
                <Typography>
                  `<Typography component="span" fontWeight="bold">{arg.name}</Typography>` ({arg.type_str}): {arg.description}
                </Typography>
                {arg.details && arg.details.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {arg.details.map((detail: string, detailIndex: number) => (
                      <li key={detailIndex}><Typography variant="body2">{detail}</Typography></li>
                    ))}
                  </ul>
                )}
              </Box>
            ))}
          </Box>
        )}

        {data.schema_attributes && data.schema_attributes.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6">Attributes</Typography>
            {data.schema_attributes.map((attr: any, index: number) => (
              <Box key={index} sx={{ ml: 2, mb: 1 }}>
                <Typography>
                  `<Typography component="span" fontWeight="bold">{attr.name}</Typography>`: {attr.description}
                </Typography>
                {attr.details && attr.details.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {attr.details.map((detail: string, detailIndex: number) => (
                      <li key={detailIndex}><Typography variant="body2">{detail}</Typography></li>
                    ))}
                  </ul>
                )}
              </Box>
            ))}
          </Box>
        )}

        {data.example_snippets && data.example_snippets.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6">Example Usage</Typography>
            {data.example_snippets.map((snippet: string, index: number) => (
              <SyntaxHighlighter
                key={index}
                language="hcl" // Assuming hcl/terraform for examples based on DOC_PARSER
                style={undefined}
                PreTag="div"
              >
                {snippet}
              </SyntaxHighlighter>
            ))}
          </Box>
        )}
      </Paper>
    );
  };

  if (message.type === 'parsed_documentation') {
    return <DocumentationViewer data={content} />;
  }

  if (message.type === 'tool_call') {
    return (
      <Paper sx={{ p: 2, backgroundColor: '#e3f2fd', mt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          <strong>Tool Call:</strong> {content.toolName}
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Parameters: {JSON.stringify(content.parameters, null, 2)}
        </Typography>
      </Paper>
    );
  }

  if (message.type === 'text') {
    return (
      <Box>
        <ReactMarkdown components={markdownComponents}>
          {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
        </ReactMarkdown>
        {renderToolOutput()}
      </Box>
    );
  }

  // Fallback for unknown message types
  return (
    <Typography variant="body1">
      {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
    </Typography>
  );
};

export default EnhancedMessageContent;

