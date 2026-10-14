import { exec } from 'child_process';
import { promisify } from 'util';
import process from 'process';

const execAsync = promisify(exec);

const SERVER_PORT = process.env.SERVER_PORT || 3001;
const CLIENT_PORT = process.env.CLIENT_PORT || 3000;

async function findAndKillProcess(port) {
  const platform = process.platform;
  
  try {
    let pid = null;
    
    if (platform === 'win32') {
      // Windows: Use netstat to find process
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].includes(`:${port}`)) {
          pid = parts[parts.length - 1];
          break;
        }
      }
      
      if (pid && pid !== '0') {
        console.log(`🛑 Killing process ${pid} on port ${port}...`);
        await execAsync(`taskkill /PID ${pid} /F`);
        return true;
      }
    } else {
      // Unix/Linux/Mac: Use lsof to find process
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      pid = stdout.trim();
      
      if (pid) {
        console.log(`🛑 Killing process ${pid} on port ${port}...`);
        await execAsync(`kill -9 ${pid}`);
        return true;
      }
    }
    
    console.log(`ℹ️  No process found on port ${port}`);
    return false;
  } catch (error) {
    // Process might already be stopped
    if (error.message.includes('No such process') || 
        error.message.includes('not found') ||
        error.message.includes('ERROR:')) {
      console.log(`ℹ️  Process on port ${port} already stopped`);
      return false;
    }
    throw error;
  }
}

async function main() {
  console.log('\n🔍 Checking for running processes...\n');
  
  let killedAny = false;
  
  try {
    const serverKilled = await findAndKillProcess(SERVER_PORT);
    killedAny = killedAny || serverKilled;
  } catch (error) {
    console.error(`❌ Error stopping server on port ${SERVER_PORT}:`, error.message);
  }
  
  try {
    const clientKilled = await findAndKillProcess(CLIENT_PORT);
    killedAny = killedAny || clientKilled;
  } catch (error) {
    console.error(`❌ Error stopping client on port ${CLIENT_PORT}:`, error.message);
  }
  
  console.log('');
  
  if (killedAny) {
    console.log('✅ All processes stopped successfully!\n');
  } else {
    console.log('ℹ️  No processes were running.\n');
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
