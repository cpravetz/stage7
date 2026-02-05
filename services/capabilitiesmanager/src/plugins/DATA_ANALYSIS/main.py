#!/usr/bin/env python3
"""
DATA_ANALYSIS Plugin - Data analysis and visualization
"""

import sys
import json
import logging
import os
from typing import Dict, Any

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs, checking aliases, and extracting from {{'value':...}} wrapper."""
    raw_val = inputs.get(key)
    if raw_val is None:
        for alias in aliases:
            raw_val = inputs.get(alias)
            if raw_val is not None:
                break
    if raw_val is None:
        return default
    if isinstance(raw_val, dict) and 'value' in raw_val:
        return raw_val['value'] if raw_val['value'] is not None else default
    return raw_val if raw_val is not None else default

def analyze_dataset(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze a dataset and return statistical insights."""
    import pandas as pd
    import numpy as np

    data = payload.get('data')
    file_path = payload.get('file_path')

    if not data and not file_path:
        raise ValueError("Either 'data' or 'file_path' must be provided")

    # Load data
    if file_path:
        if file_path.endswith('.csv'):
            df = pd.read_csv(file_path)
        elif file_path.endswith('.json'):
            df = pd.read_json(file_path)
        else:
            raise ValueError("Unsupported file format. Use CSV or JSON")
    else:
        df = pd.DataFrame(data)

    # Generate statistics
    stats = {
        'row_count': len(df),
        'column_count': len(df.columns),
        'columns': list(df.columns),
        'dtypes': {col: str(dtype) for col, dtype in df.dtypes.items()},
        'missing_values': df.isnull().sum().to_dict(),
        'numeric_summary': df.describe().to_dict() if len(df.select_dtypes(include=[np.number]).columns) > 0 else {}
    }

    return stats

def generate_insights(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate insights from a dataset."""
    import pandas as pd
    import numpy as np

    data = payload.get('data')
    file_path = payload.get('file_path')

    if not data and not file_path:
        raise ValueError("Either 'data' or 'file_path' must be provided")

    # Load data
    if file_path:
        if file_path.endswith('.csv'):
            df = pd.read_csv(file_path)
        elif file_path.endswith('.json'):
            df = pd.read_json(file_path)
        else:
            raise ValueError("Unsupported file format. Use CSV or JSON")
    else:
        df = pd.DataFrame(data)

    insights = []

    # Check for missing data
    missing = df.isnull().sum()
    if missing.any():
        insights.append({
            'type': 'missing_data',
            'message': f"Found missing values in {missing[missing > 0].count()} columns",
            'details': missing[missing > 0].to_dict()
        })

    # Check for numeric columns
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    if len(numeric_cols) > 0:
        for col in numeric_cols:
            insights.append({
                'type': 'numeric_summary',
                'column': col,
                'mean': float(df[col].mean()),
                'median': float(df[col].median()),
                'std': float(df[col].std()),
                'min': float(df[col].min()),
                'max': float(df[col].max())
            })

    # Check for correlations
    if len(numeric_cols) > 1:
        corr_matrix = df[numeric_cols].corr()
        high_corr = []
        for i in range(len(corr_matrix.columns)):
            for j in range(i+1, len(corr_matrix.columns)):
                if abs(corr_matrix.iloc[i, j]) > 0.7:
                    high_corr.append({
                        'col1': corr_matrix.columns[i],
                        'col2': corr_matrix.columns[j],
                        'correlation': float(corr_matrix.iloc[i, j])
                    })
        if high_corr:
            insights.append({
                'type': 'high_correlation',
                'message': f"Found {len(high_corr)} highly correlated column pairs",
                'details': high_corr
            })

    return {'insights': insights, 'count': len(insights)}

def create_visualization(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a visualization from data."""
    import pandas as pd
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt
    import base64
    from io import BytesIO

    data = payload.get('data')
    file_path = payload.get('file_path')
    chart_type = payload.get('chart_type', 'bar')
    x_column = payload.get('x_column')
    y_column = payload.get('y_column')
    title = payload.get('title', 'Data Visualization')

    if not data and not file_path:
        raise ValueError("Either 'data' or 'file_path' must be provided")

    # Load data
    if file_path:
        if file_path.endswith('.csv'):
            df = pd.read_csv(file_path)
        elif file_path.endswith('.json'):
            df = pd.read_json(file_path)
        else:
            raise ValueError("Unsupported file format. Use CSV or JSON")
    else:
        df = pd.DataFrame(data)

    # Create plot
    plt.figure(figsize=(10, 6))

    if chart_type == 'bar':
        if x_column and y_column:
            df.plot(x=x_column, y=y_column, kind='bar')
        else:
            df.plot(kind='bar')
    elif chart_type == 'line':
        if x_column and y_column:
            df.plot(x=x_column, y=y_column, kind='line')
        else:
            df.plot(kind='line')
    elif chart_type == 'scatter':
        if x_column and y_column:
            df.plot(x=x_column, y=y_column, kind='scatter')
        else:
            raise ValueError("scatter plot requires x_column and y_column")
    elif chart_type == 'hist':
        if y_column:
            df[y_column].plot(kind='hist')
        else:
            df.plot(kind='hist')
    else:
        raise ValueError(f"Unsupported chart type: {chart_type}")

    plt.title(title)
    plt.tight_layout()

    # Convert to base64
    buffer = BytesIO()
    plt.savefig(buffer, format='png')
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.read()).decode()
    plt.close()

    return {
        'image': f"data:image/png;base64,{image_base64}",
        'format': 'png',
        'chart_type': chart_type
    }

def execute_plugin(inputs):
    """Main plugin execution function."""
    try:
        action = _get_input(inputs, 'action', ['operation', 'command'])
        payload = _get_input(inputs, 'payload', ['data', 'params', 'parameters'], default={})

        if not action:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "Missing required parameter 'action'",
                "error": "Missing required parameter 'action'"
            }]

        logger.info(f"Executing action: {action} with payload keys: {list(payload.keys())}")

        # Route to appropriate handler
        handlers = {
            'analyzeDataset': analyze_dataset,
            'generateInsights': generate_insights,
            'createVisualization': create_visualization
        }

        handler = handlers.get(action)
        if not handler:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Unknown action: {action}",
                "error": f"Unknown action: {action}. Available actions: {', '.join(handlers.keys())}"
            }]

        result = handler(payload)

        return [{
            "success": True,
            "name": "result",
            "resultType": "object",
            "result": result,
            "resultDescription": f"Result of {action} operation"
        }]

    except Exception as e:
        logger.error(f"Error in execute_plugin: {e}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }]

def parse_inputs(inputs_str):
    """Parse and normalize the plugin stdin JSON payload into a dict."""
    try:
        payload = json.loads(inputs_str)
        inputs_dict = {{}}

        if isinstance(payload, dict):
            if payload.get('_type') == 'Map' and isinstance(payload.get('entries'), list):
                for entry in payload.get('entries', []):
                    if isinstance(entry, list) and len(entry) == 2:
                        key, value = entry
                        inputs_dict[key] = value
            else:
                for key, value in payload.items():
                    if key not in ('_type', 'entries'):
                        inputs_dict[key] = value

        elif isinstance(payload, list):
            for item in payload:
                if isinstance(item, list) and len(item) == 2:
                    key, value = item
                    inputs_dict[key] = value

        return inputs_dict

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse input JSON: {{e}}")
        raise

def main():
    """Main entry point for the plugin."""
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            result = [{{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "No input data received",
                "error": "No input data received"
            }}]
        else:
            inputs_dict = parse_inputs(input_data)
            result = execute_plugin(inputs_dict)

        print(json.dumps(result))

    except Exception as e:
        logger.error(f"Plugin execution failed: {str(e)}")
        result = [{{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }}]
        print(json.dumps(result))

if __name__ == "__main__":
    main()
