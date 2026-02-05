import React from 'react';
import { Paper, Typography, Box, LinearProgress, Chip, Avatar } from '@mui/material';
import { CheckCircle, Warning, Error, NetworkCell } from '@mui/icons-material';

interface Service {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency_p99_ms: number;
  error_rate_percent: number;
  traffic_rps: number;
}

interface ServiceMeshData {
  mesh_name: string;
  total_services: number;
  healthy_services: number;
  avg_latency_ms: number;
  error_rate_percent: number;
  services: Service[];
  dependencies_mapped: number;
  virtual_services: number;
  destination_rules: number;
}

interface ServiceMeshWidgetProps {
  data: ServiceMeshData;
}

export const ServiceMeshWidget: React.FC<ServiceMeshWidgetProps> = ({ data }) => {
  const healthyPercent = data.total_services > 0 
    ? (data.healthy_services / data.total_services) * 100 
    : 0;

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' => {
    switch (status) {
      case 'healthy': return 'success';
      case 'degraded': return 'warning';
      case 'down': return 'error';
      default: return 'success';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle color="success" sx={{ fontSize: 16 }} />;
      case 'degraded':
        return <Warning color="warning" sx={{ fontSize: 16 }} />;
      case 'down':
        return <Error color="error" sx={{ fontSize: 16 }} />;
      default:
        return null;
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <NetworkCell fontSize="small" />
        Service Mesh Health
      </Typography>

      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="textSecondary">
            Service Health
          </Typography>
          <Typography variant="body2" fontWeight="bold">
            {Math.round(healthyPercent)}%
          </Typography>
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={healthyPercent}
          sx={{ height: 6, borderRadius: 1 }}
        />
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
          Performance Metrics
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip 
            label={`P99: ${Math.round(data.avg_latency_ms)}ms`} 
            size="small"
            color={data.avg_latency_ms > 100 ? 'warning' : 'default'}
            variant="outlined"
          />
          <Chip 
            label={`Error: ${Math.round(data.error_rate_percent)}%`} 
            size="small"
            color={data.error_rate_percent > 1 ? 'error' : 'default'}
            variant="outlined"
          />
          <Chip 
            label={`${data.dependencies_mapped} deps`} 
            size="small"
            variant="outlined"
          />
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
          Top Services
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 120, overflowY: 'auto' }}>
          {data.services.slice(0, 4).map((service, idx) => (
            <Box 
              key={idx}
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                p: 1,
                backgroundColor: '#f5f5f5',
                borderRadius: 1
              }}
            >
              {getStatusIcon(service.status)}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" fontWeight="bold" sx={{ display: 'block' }}>
                  {service.name}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {Math.round(service.latency_p99_ms)}ms / {Math.round(service.error_rate_percent)}%
                </Typography>
              </Box>
              <Chip 
                label={`${service.traffic_rps}rps`}
                size="small"
                variant="outlined"
              />
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip 
          label={`${data.virtual_services} VirtualServices`}
          size="small"
          variant="outlined"
        />
        <Chip 
          label={`${data.destination_rules} DestRules`}
          size="small"
          variant="outlined"
        />
      </Box>
    </Paper>
  );
};


