"""
Flow tools for comprehensive Bugsnag user error analysis.
"""
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone, timedelta
from tools.primitives.bugsnag import search_bugsnag_errors, get_bugsnag_error_details
from tools.wrappers.bugsnag_errors import search_user_errors_bugsnag


def fetch_bugsnag_user_logs(
    user_id: int,
    timeframe_minutes: int = 1440,
    start_time: Optional[str] = None,
    limit_per_project: int = 25
) -> Dict[str, Any]:
    """
    Fetch Bugsnag errors for a user across mobile and dashboard projects.
    
    This flow tool searches for user-specific errors in:
    - Mobile app (Connecteam project)
    - Dashboard (Connecteam-Dashboard project)
    
    Args:
        user_id: User ID to search for
        timeframe_minutes: Time window in minutes (default: 1440 = 24 hours)
        start_time: Optional start time in ISO format (e.g., '2025-06-23T00:00:00Z')
        limit_per_project: Max errors per project (default: 25)
        
    Returns:
        Dictionary containing errors from both mobile and dashboard projects
    """
    try:
        # Calculate time range
        if start_time:
            try:
                start_time_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                end_time_dt = start_time_dt + timedelta(minutes=timeframe_minutes)
            except ValueError:
                # Fallback to current time if start_time is invalid
                end_time_dt = datetime.now(timezone.utc)
                start_time_dt = end_time_dt - timedelta(minutes=timeframe_minutes)
        else:
            end_time_dt = datetime.now(timezone.utc)
            start_time_dt = end_time_dt - timedelta(minutes=timeframe_minutes)
        
        # Project mapping based on the health check results
        projects = {
            'mobile': {
                'id': '5d3d37ee9e40380011caf720',  # Connecteam project ID
                'name': 'Connecteam (Mobile)',
                'type': 'mobile'
            },
            'dashboard': {
                'id': '607c531330d97a000df4982c',  # Connecteam-Dashboard project ID  
                'name': 'Connecteam-Dashboard (Web)',
                'type': 'dashboard'
            }
        }
        
        results = {
            'user_id': user_id,
            'search_period': {
                'start': start_time_dt.isoformat(),
                'end': end_time_dt.isoformat(),
                'timeframe_minutes': timeframe_minutes
            },
            'projects_searched': [],
            'mobile_errors': [],
            'dashboard_errors': [],
            'summary': {
                'total_mobile_errors': 0,
                'total_dashboard_errors': 0,
                'total_errors_across_platforms': 0,
                'has_mobile_issues': False,
                'has_dashboard_issues': False,
                'critical_errors_found': False
            }
        }
        
        # Search each project
        for project_key, project_info in projects.items():
            try:
                # Search for errors in this specific project
                # Convert timestamps to Z format (Bugsnag API requirement)
                start_time_str = start_time_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
                end_time_str = end_time_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
                
                project_result = search_bugsnag_errors(
                    project_id=project_info['id'],
                    user_id=str(user_id),
                    start_time=start_time_str,
                    end_time=end_time_str,
                    limit=limit_per_project
                )
                
                project_search_info = {
                    'project_id': project_info['id'],
                    'project_name': project_info['name'],
                    'project_type': project_info['type'],
                    'status': 'success' if not project_result.get('error') else 'error',
                    'errors_found': 0
                }
                
                if project_result.get('error'):
                    project_search_info['error_message'] = project_result.get('message', 'Unknown error')
                    results['projects_searched'].append(project_search_info)
                    continue
                
                # Process errors for this project
                project_errors = project_result.get('errors', [])
                processed_errors = []
                
                for error in project_errors:
                    processed_error = {
                        'id': error.get('id'),
                        'class': error.get('class'),
                        'message': error.get('message'),
                        'context': error.get('context'),
                        'first_seen': error.get('first_seen'),
                        'last_seen': error.get('last_seen'),
                        'events_count': error.get('events_count', 0),
                        'users_count': error.get('users_count', 0),
                        'severity': error.get('severity'),
                        'status': error.get('status'),
                        'url': error.get('url'),
                        'project_name': project_info['name'],
                        'platform': project_info['type']
                    }
                    processed_errors.append(processed_error)
                    
                    # Check for critical errors
                    if error.get('severity') == 'error':
                        results['summary']['critical_errors_found'] = True
                
                # Store results by project type
                if project_key == 'mobile':
                    results['mobile_errors'] = processed_errors
                    results['summary']['total_mobile_errors'] = len(processed_errors)
                    results['summary']['has_mobile_issues'] = len(processed_errors) > 0
                elif project_key == 'dashboard':
                    results['dashboard_errors'] = processed_errors
                    results['summary']['total_dashboard_errors'] = len(processed_errors)
                    results['summary']['has_dashboard_issues'] = len(processed_errors) > 0
                
                project_search_info['errors_found'] = len(processed_errors)
                results['projects_searched'].append(project_search_info)
                
            except Exception as e:
                project_search_info = {
                    'project_id': project_info['id'],
                    'project_name': project_info['name'],
                    'project_type': project_info['type'],
                    'status': 'error',
                    'error_message': str(e),
                    'errors_found': 0
                }
                results['projects_searched'].append(project_search_info)
        
        # Calculate total errors across platforms
        results['summary']['total_errors_across_platforms'] = (
            results['summary']['total_mobile_errors'] + 
            results['summary']['total_dashboard_errors']
        )
        
        # Generate insights
        insights = []
        if results['summary']['total_errors_across_platforms'] == 0:
            insights.append("✅ No errors found for this user across mobile and dashboard platforms")
        else:
            if results['summary']['has_mobile_issues']:
                insights.append(f"📱 {results['summary']['total_mobile_errors']} mobile app errors found")
            if results['summary']['has_dashboard_issues']:
                insights.append(f"💻 {results['summary']['total_dashboard_errors']} dashboard errors found")
            if results['summary']['critical_errors_found']:
                insights.append("🚨 Critical errors detected - immediate attention required")
            
            # Platform comparison
            if results['summary']['has_mobile_issues'] and results['summary']['has_dashboard_issues']:
                insights.append("⚠️ Cross-platform issues detected - may indicate backend or user-specific problem")
            elif results['summary']['has_mobile_issues'] and not results['summary']['has_dashboard_issues']:
                insights.append("📱 Issues isolated to mobile platform")
            elif results['summary']['has_dashboard_issues'] and not results['summary']['has_mobile_issues']:
                insights.append("💻 Issues isolated to dashboard platform")
        
        results['insights'] = insights
        
        return results
        
    except Exception as e:
        return {
            'error': True,
            'message': f'Bugsnag user log search failed: {str(e)}',
            'user_id': user_id
        }
