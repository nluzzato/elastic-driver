#!/usr/bin/env python3
"""
Master test runner for all debug scripts.

Runs all debug tests and provides a comprehensive report.
"""
import asyncio
import subprocess
import sys
import os
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from debug.utils.test_helpers import print_header, print_success, print_error, print_info


class MasterTestRunner:
    def __init__(self):
        self.test_scripts = [
            {
                "name": "Health Check Tests",
                "script": "test_health.py",
                "description": "Test consolidated health functionality for all services"
            },
            {
                "name": "Elasticsearch Tests", 
                "script": "test_elasticsearch.py",
                "description": "Test Elasticsearch connectivity and query functionality"
            },
            {
                "name": "Bugsnag Filter Tests",
                "script": "test_bugsnag_filters.py", 
                "description": "Test Bugsnag API filter combinations and debug 400 errors"
            }
        ]
        self.results = []

    def run_script(self, script_path: str) -> dict:
        """Run a single test script and capture results."""
        try:
            print_info(f"Running {script_path}...")
            
            result = subprocess.run(
                [sys.executable, script_path],
                cwd=os.path.dirname(os.path.abspath(__file__)),
                capture_output=True,
                text=True,
                timeout=120  # 2 minute timeout
            )
            
            return {
                "success": result.returncode == 0,
                "returncode": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr
            }
            
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "returncode": -1,
                "stdout": "",
                "stderr": "Test timed out after 120 seconds"
            }
        except Exception as e:
            return {
                "success": False,
                "returncode": -1,
                "stdout": "",
                "stderr": str(e)
            }

    def parse_test_output(self, output: str) -> dict:
        """Parse test output to extract summary information."""
        lines = output.split('\n')
        summary = {"passed": 0, "failed": 0, "total": 0}
        
        for line in lines:
            if "Passed:" in line:
                try:
                    summary["passed"] = int(line.split("Passed:")[1].strip())
                except:
                    pass
            elif "Failed:" in line:
                try:
                    summary["failed"] = int(line.split("Failed:")[1].strip())
                except:
                    pass
            elif "Total Tests:" in line:
                try:
                    summary["total"] = int(line.split("Total Tests:")[1].strip())
                except:
                    pass
        
        return summary

    def run_all_tests(self) -> None:
        """Run all test scripts and generate report."""
        print_header("MCP DEBUG TEST SUITE")
        print_info(f"Running {len(self.test_scripts)} test suites...")
        print_info(f"Started at: {datetime.now().isoformat()}")
        
        total_passed = 0
        total_failed = 0
        successful_suites = 0
        
        for test_config in self.test_scripts:
            print(f"\n{'='*60}")
            print(f"🧪 {test_config['name']}")
            print(f"{'='*60}")
            print(f"📝 {test_config['description']}")
            
            # Run the test
            result = self.run_script(test_config['script'])
            
            if result['success']:
                print_success(f"{test_config['name']} completed successfully")
                successful_suites += 1
                
                # Parse summary from output
                summary = self.parse_test_output(result['stdout'])
                total_passed += summary.get('passed', 0)
                total_failed += summary.get('failed', 0)
                
                # Show key output lines
                output_lines = result['stdout'].split('\n')
                for line in output_lines:
                    if any(marker in line for marker in ['✅', '❌', '📊', '🎉']):
                        print(f"   {line}")
                
            else:
                print_error(f"{test_config['name']} failed (exit code: {result['returncode']})")
                
                # Show error output
                if result['stderr']:
                    print_error(f"Error output: {result['stderr'][:200]}...")
                if result['stdout']:
                    # Show last few lines of stdout
                    stdout_lines = result['stdout'].split('\n')[-10:]
                    for line in stdout_lines:
                        if line.strip():
                            print(f"   {line}")
            
            # Store result
            self.results.append({
                "name": test_config['name'],
                "script": test_config['script'],
                "success": result['success'],
                "summary": self.parse_test_output(result['stdout']) if result['success'] else None,
                "error": result['stderr'] if not result['success'] else None
            })
        
        # Final summary
        self.print_final_summary(successful_suites, total_passed, total_failed)

    def print_final_summary(self, successful_suites: int, total_passed: int, total_failed: int) -> None:
        """Print final test summary."""
        print(f"\n{'='*80}")
        print("🏆 FINAL TEST SUMMARY")
        print(f"{'='*80}")
        
        total_tests = total_passed + total_failed
        total_suites = len(self.test_scripts)
        
        print(f"📊 Test Suites: {successful_suites}/{total_suites} successful")
        print(f"📊 Individual Tests: {total_passed}/{total_tests} passed")
        
        if total_failed > 0:
            print(f"❌ {total_failed} tests failed")
        
        # Per-suite breakdown
        print(f"\n📋 Per-Suite Results:")
        for result in self.results:
            status = "✅" if result['success'] else "❌"
            print(f"   {status} {result['name']}")
            if result['summary']:
                summary = result['summary']
                if summary.get('total', 0) > 0:
                    print(f"      Tests: {summary.get('passed', 0)}/{summary.get('total', 0)} passed")
            elif result['error']:
                print(f"      Error: {result['error'][:100]}...")
        
        # Overall result
        if successful_suites == total_suites and total_failed == 0:
            print(f"\n🎉 ALL TESTS PASSED!")
            sys.exit(0)
        else:
            print(f"\n⚠️  Some tests failed - check individual outputs above")
            sys.exit(1)


def main():
    """Main entry point."""
    runner = MasterTestRunner()
    runner.run_all_tests()


if __name__ == "__main__":
    main()
