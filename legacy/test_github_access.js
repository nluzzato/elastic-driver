// Simple test to verify GitHub token and repository access

const fs = require('fs');
const path = require('path');

// Load environment variables
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        process.env[key.trim()] = value.trim();
      }
    });
  }
}

loadEnv();

async function testGitHubAccess() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || 'Connecteam';
  const repo = process.env.GITHUB_REPO || 'alerts';
  
  if (!token) {
    console.log("❌ No GitHub token found in .env file");
    return;
  }
  
  console.log("🔧 Testing GitHub access...");
  console.log(`📍 Target repository: ${owner}/${repo}`);
  
  // Test 1: Check user authentication
  try {
    console.log("\n1️⃣ Testing user authentication...");
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Alert-Context-Agent/1.0'
      }
    });
    
    if (userResponse.ok) {
      const user = await userResponse.json();
      console.log(`✅ Authenticated as: ${user.login}`);
    } else {
      console.log(`❌ Authentication failed: ${userResponse.status} ${userResponse.statusText}`);
      return;
    }
  } catch (error) {
    console.log(`❌ Authentication error: ${error.message}`);
    return;
  }
  
  // Test 2: Check repository access
  try {
    console.log("\n2️⃣ Testing repository access...");
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Alert-Context-Agent/1.0'
      }
    });
    
    if (repoResponse.ok) {
      const repoData = await repoResponse.json();
      console.log(`✅ Repository access confirmed`);
      console.log(`📊 Repository: ${repoData.full_name}`);
      console.log(`🔒 Private: ${repoData.private}`);
      console.log(`📝 Description: ${repoData.description || 'No description'}`);
    } else {
      console.log(`❌ Repository access failed: ${repoResponse.status} ${repoResponse.statusText}`);
      
      if (repoResponse.status === 404) {
        console.log("💡 This could mean:");
        console.log("   - Repository doesn't exist");
        console.log("   - Repository is private and token doesn't have access");
        console.log("   - Repository name is incorrect");
      }
      return;
    }
  } catch (error) {
    console.log(`❌ Repository access error: ${error.message}`);
    return;
  }
  
  // Test 3: List repository contents
  try {
    console.log("\n3️⃣ Testing repository contents access...");
    const contentsResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Alert-Context-Agent/1.0'
      }
    });
    
    if (contentsResponse.ok) {
      const contents = await contentsResponse.json();
      console.log(`✅ Repository contents accessible`);
      console.log(`📁 Found ${contents.length} items in root directory:`);
      contents.slice(0, 10).forEach(item => {
        console.log(`   ${item.type === 'dir' ? '📁' : '📄'} ${item.name}`);
      });
      if (contents.length > 10) {
        console.log(`   ... and ${contents.length - 10} more items`);
      }
    } else {
      console.log(`❌ Contents access failed: ${contentsResponse.status} ${contentsResponse.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Contents access error: ${error.message}`);
  }
  
  console.log("\n🎯 Summary:");
  console.log("If all tests passed, the script should work!");
  console.log("If any test failed, check:");
  console.log("• GitHub token has correct permissions");
  console.log("• Repository name is correct");  
  console.log("• Token has access to the private repository");
}

// Check if fetch is available
if (typeof fetch === 'undefined') {
  console.log("⚠️  This script requires Node.js 18+ for fetch support");
  process.exit(1);
}

testGitHubAccess().catch(console.error);
