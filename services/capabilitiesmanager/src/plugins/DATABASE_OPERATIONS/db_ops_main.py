"""
DATABASE_OPERATIONS Plugin - Handles database query and CRUD operations
Provides SQL execution, transaction management, and query optimization
"""

import logging
import json
import hashlib
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
import threading
from queue import Queue

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# In-memory storage for connections and query cache
_data = {
    'connections': {},
    'transactions': {},
    'query_cache': {},
    'connection_pool': [],
    'query_logs': [],
    'max_pool_size': 10,
    'pool_lock': threading.Lock()
}


def _get_input(inputs: Dict[str, Any], key: str, default: Any = None) -> Any:
    """Helper function to safely extract input parameters"""
    if not isinstance(inputs, dict):
        logger.error(f"Invalid inputs type: {type(inputs)}")
        return default
    return inputs.get(key, default)


def _generate_connection_id(host: str, db: str) -> str:
    """Generate unique connection identifier"""
    conn_str = f"{host}:{db}"
    return hashlib.md5(conn_str.encode()).hexdigest()[:12]


def _generate_transaction_id() -> str:
    """Generate unique transaction identifier"""
    ts = datetime.now().isoformat()
    return hashlib.md5(ts.encode()).hexdigest()[:12]


def _log_query(query: str, connection_id: str, status: str, error: Optional[str] = None) -> None:
    """Log query execution details"""
    log_entry = {
        'timestamp': datetime.now().isoformat(),
        'query_hash': hashlib.md5(query.encode()).hexdigest()[:8],
        'connection_id': connection_id,
        'status': status,
        'error': error
    }
    _data['query_logs'].append(log_entry)
    if len(_data['query_logs']) > 1000:
        _data['query_logs'] = _data['query_logs'][-500:]
    
    log_msg = f"Query {log_entry['query_hash']} on {connection_id}: {status}"
    if error:
        logger.error(f"{log_msg} - Error: {error}")
    else:
        logger.info(log_msg)


def _acquire_pool_connection(host: str, db: str, user: str) -> Dict[str, Any]:
    """Acquire a connection from the pool or create new one"""
    with _data['pool_lock']:
        conn_id = _generate_connection_id(host, db)
        
        # Check if connection already exists in pool
        for conn in _data['connection_pool']:
            if conn['id'] == conn_id and not conn['in_use']:
                conn['in_use'] = True
                conn['last_used'] = datetime.now().isoformat()
                logger.info(f"Reused pooled connection: {conn_id}")
                return conn
        
        # Create new connection if pool not full
        if len(_data['connection_pool']) < _data['max_pool_size']:
            connection = {
                'id': conn_id,
                'host': host,
                'database': db,
                'user': user,
                'in_use': True,
                'created_at': datetime.now().isoformat(),
                'last_used': datetime.now().isoformat(),
                'query_count': 0,
                'status': 'connected'
            }
            _data['connection_pool'].append(connection)
            logger.info(f"Created new pool connection: {conn_id}")
            return connection
        
        # Reuse oldest least-used connection
        lru_conn = min(_data['connection_pool'], key=lambda c: c['last_used'])
        lru_conn['in_use'] = True
        lru_conn['last_used'] = datetime.now().isoformat()
        logger.info(f"Reused LRU connection: {lru_conn['id']}")
        return lru_conn


def _release_pool_connection(conn_id: str) -> None:
    """Release connection back to pool"""
    with _data['pool_lock']:
        for conn in _data['connection_pool']:
            if conn['id'] == conn_id:
                conn['in_use'] = False
                logger.info(f"Released connection: {conn_id}")
                return


def handle_execute_query(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Execute parameterized SQL query with connection pooling"""
    try:
        query = _get_input(inputs, 'query', '')
        host = _get_input(inputs, 'host', 'localhost')
        database = _get_input(inputs, 'database', 'default')
        user = _get_input(inputs, 'user', 'app_user')
        params = _get_input(inputs, 'parameters', [])
        use_cache = _get_input(inputs, 'use_cache', False)
        
        if not query:
            return {'success': False, 'error': 'Query parameter is required'}
        
        # Acquire connection from pool
        connection = _acquire_pool_connection(host, database, user)
        conn_id = connection['id']
        
        try:
            # Check query cache
            query_hash = hashlib.md5((query + str(params)).encode()).hexdigest()
            if use_cache and query_hash in _data['query_cache']:
                logger.info(f"Cache hit for query: {query_hash[:8]}")
                return {
                    'success': True,
                    'result': _data['query_cache'][query_hash],
                    'from_cache': True
                }
            
            # Simulate parameterized query execution
            result = {
                'query_id': hashlib.md5(query.encode()).hexdigest()[:8],
                'rows_affected': len(params) if isinstance(params, list) else 1,
                'execution_time_ms': 15,
                'status': 'success',
                'data': {'sample_rows': params[:5] if isinstance(params, list) else []}
            }
            
            # Cache result if requested
            if use_cache:
                _data['query_cache'][query_hash] = result
                logger.info(f"Cached query result: {query_hash[:8]}")
            
            connection['query_count'] += 1
            _log_query(query, conn_id, 'executed', None)
            
            return {
                'success': True,
                'result': result,
                'connection_id': conn_id,
                'from_cache': False
            }
        finally:
            _release_pool_connection(conn_id)
    
    except Exception as e:
        error_msg = f"Query execution failed: {str(e)}"
        logger.error(error_msg)
        return {'success': False, 'error': error_msg}


def handle_create_record(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Insert new record with validation"""
    try:
        table = _get_input(inputs, 'table', '')
        data = _get_input(inputs, 'data', {})
        host = _get_input(inputs, 'host', 'localhost')
        database = _get_input(inputs, 'database', 'default')
        user = _get_input(inputs, 'user', 'app_user')
        
        if not table or not isinstance(data, dict):
            return {'success': False, 'error': 'Table and data parameters required'}
        
        connection = _acquire_pool_connection(host, database, user)
        conn_id = connection['id']
        
        try:
            # Simulate record insertion
            record_id = hashlib.md5(
                f"{table}{datetime.now().isoformat()}".encode()
            ).hexdigest()[:12]
            
            created_record = {
                'id': record_id,
                **data,
                'created_at': datetime.now().isoformat(),
                'created_by': user
            }
            
            _log_query(f"INSERT INTO {table}", conn_id, 'executed', None)
            
            return {
                'success': True,
                'result': {
                    'record_id': record_id,
                    'inserted': created_record,
                    'rows_affected': 1
                },
                'connection_id': conn_id
            }
        finally:
            _release_pool_connection(conn_id)
    
    except Exception as e:
        error_msg = f"Record creation failed: {str(e)}"
        logger.error(error_msg)
        return {'success': False, 'error': error_msg}


def handle_update_record(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Update existing record with change tracking"""
    try:
        table = _get_input(inputs, 'table', '')
        record_id = _get_input(inputs, 'record_id', '')
        updates = _get_input(inputs, 'updates', {})
        host = _get_input(inputs, 'host', 'localhost')
        database = _get_input(inputs, 'database', 'default')
        user = _get_input(inputs, 'user', 'app_user')
        
        if not table or not record_id or not isinstance(updates, dict):
            return {'success': False, 'error': 'Table, record_id and updates required'}
        
        connection = _acquire_pool_connection(host, database, user)
        conn_id = connection['id']
        
        try:
            updated_record = {
                'id': record_id,
                **updates,
                'updated_at': datetime.now().isoformat(),
                'updated_by': user
            }
            
            _log_query(f"UPDATE {table} WHERE id={record_id}", conn_id, 'executed', None)
            
            return {
                'success': True,
                'result': {
                    'record_id': record_id,
                    'updated': updated_record,
                    'rows_affected': 1,
                    'changes_made': list(updates.keys())
                },
                'connection_id': conn_id
            }
        finally:
            _release_pool_connection(conn_id)
    
    except Exception as e:
        error_msg = f"Record update failed: {str(e)}"
        logger.error(error_msg)
        return {'success': False, 'error': error_msg}


def handle_delete_record(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Delete record with cascade option"""
    try:
        table = _get_input(inputs, 'table', '')
        record_id = _get_input(inputs, 'record_id', '')
        cascade = _get_input(inputs, 'cascade', False)
        host = _get_input(inputs, 'host', 'localhost')
        database = _get_input(inputs, 'database', 'default')
        user = _get_input(inputs, 'user', 'app_user')
        
        if not table or not record_id:
            return {'success': False, 'error': 'Table and record_id required'}
        
        connection = _acquire_pool_connection(host, database, user)
        conn_id = connection['id']
        
        try:
            deleted_info = {
                'record_id': record_id,
                'table': table,
                'cascade_delete': cascade,
                'deleted_at': datetime.now().isoformat(),
                'deleted_by': user,
                'related_records_deleted': 5 if cascade else 0
            }
            
            _log_query(f"DELETE FROM {table} WHERE id={record_id}", conn_id, 'executed', None)
            
            return {
                'success': True,
                'result': deleted_info,
                'connection_id': conn_id
            }
        finally:
            _release_pool_connection(conn_id)
    
    except Exception as e:
        error_msg = f"Record deletion failed: {str(e)}"
        logger.error(error_msg)
        return {'success': False, 'error': error_msg}


def handle_bulk_import(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Import multiple records with transaction support"""
    try:
        table = _get_input(inputs, 'table', '')
        records = _get_input(inputs, 'records', [])
        host = _get_input(inputs, 'host', 'localhost')
        database = _get_input(inputs, 'database', 'default')
        user = _get_input(inputs, 'user', 'app_user')
        batch_size = _get_input(inputs, 'batch_size', 100)
        
        if not table or not isinstance(records, list) or len(records) == 0:
            return {'success': False, 'error': 'Table and records array required'}
        
        connection = _acquire_pool_connection(host, database, user)
        conn_id = connection['id']
        
        try:
            transaction_id = _generate_transaction_id()
            
            inserted_count = 0
            failed_count = 0
            batches_processed = 0
            
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                try:
                    inserted_count += len(batch)
                    batches_processed += 1
                except:
                    failed_count += len(batch)
            
            import_result = {
                'transaction_id': transaction_id,
                'table': table,
                'total_records': len(records),
                'inserted': inserted_count,
                'failed': failed_count,
                'batches_processed': batches_processed,
                'import_time_ms': 125,
                'status': 'completed' if failed_count == 0 else 'partial'
            }
            
            _log_query(f"BULK INSERT INTO {table}", conn_id, 'executed', None)
            
            return {
                'success': True,
                'result': import_result,
                'connection_id': conn_id,
                'transaction_id': transaction_id
            }
        finally:
            _release_pool_connection(conn_id)
    
    except Exception as e:
        error_msg = f"Bulk import failed: {str(e)}"
        logger.error(error_msg)
        return {'success': False, 'error': error_msg}


def handle_optimize_query(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze and optimize query performance"""
    try:
        query = _get_input(inputs, 'query', '')
        host = _get_input(inputs, 'host', 'localhost')
        database = _get_input(inputs, 'database', 'default')
        
        if not query:
            return {'success': False, 'error': 'Query parameter required'}
        
        connection = _acquire_pool_connection(host, database, 'analyzer')
        conn_id = connection['id']
        
        try:
            # Simulate query analysis
            suggestions = []
            estimated_cost = 1000
            
            if 'SELECT *' in query.upper():
                suggestions.append('Use specific column names instead of SELECT *')
                estimated_cost -= 200
            
            if 'OR' in query.upper():
                suggestions.append('Consider using UNION for complex OR conditions')
            
            if 'LIKE' in query.upper() and query.upper().startswith('%'):
                suggestions.append('Leading wildcard may prevent index usage')
                estimated_cost -= 150
            
            if 'JOIN' in query.upper():
                suggestions.append('Ensure join columns are indexed')
            
            optimization = {
                'query_hash': hashlib.md5(query.encode()).hexdigest()[:8],
                'current_cost': estimated_cost,
                'optimized_cost': max(100, estimated_cost - 300),
                'improvement_percentage': 30,
                'suggestions': suggestions,
                'index_recommendations': ['idx_table_id', 'idx_created_date'],
                'analysis_time_ms': 8
            }
            
            _log_query(f"ANALYZE {query[:50]}", conn_id, 'executed', None)
            
            return {
                'success': True,
                'result': optimization,
                'connection_id': conn_id
            }
        finally:
            _release_pool_connection(conn_id)
    
    except Exception as e:
        error_msg = f"Query optimization failed: {str(e)}"
        logger.error(error_msg)
        return {'success': False, 'error': error_msg}


def execute_plugin(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Main plugin execution entry point"""
    try:
        action = _get_input(inputs, 'action', '')
        
        action_handlers = {
            'execute_query': handle_execute_query,
            'create_record': handle_create_record,
            'update_record': handle_update_record,
            'delete_record': handle_delete_record,
            'bulk_import': handle_bulk_import,
            'optimize_query': handle_optimize_query
        }
        
        if action not in action_handlers:
            return {
                'success': False,
                'error': f'Unknown action: {action}',
                'available_actions': list(action_handlers.keys())
            }
        
        logger.info(f"Executing DATABASE_OPERATIONS action: {action}")
        result = action_handlers[action](inputs)
        return result
    
    except Exception as e:
        error_msg = f"Plugin execution error: {str(e)}"
        logger.error(error_msg)
        return {'success': False, 'error': error_msg}
