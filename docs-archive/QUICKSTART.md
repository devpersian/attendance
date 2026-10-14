# Quick Start Guide

## 🚀 Fastest Way to Start (Demo Mode - No Database Required)

If you just want to test the application without setting up SQL Server:

```bash
# Install dependencies (if not already done)
npm install

# Start the frontend
npm run dev
```

Open http://localhost:5173 in your browser.

**Note**: In demo mode, all data is stored in your browser's local storage.

---

## 🗄️ Full Setup (With SQL Server Database)

### Prerequisites

1. **Node.js** (v18 or higher)
2. **SQL Server** (2019 or higher)
3. **SQL Server Management Studio** (optional, for database management)

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env file with your SQL Server credentials
nano .env  # or use your preferred editor
```

**Required environment variables:**
```env
# SQL Server Configuration
DB_SERVER=localhost
DB_DATABASE=AttendanceDB
DB_USER=sa
DB_PASSWORD=YourPassword123!
DB_PORT=1433

# Server & Client Ports
SERVER_PORT=3001
CLIENT_PORT=3000
NODE_ENV=development

# CORS (auto-constructed from CLIENT_PORT)
# FRONTEND_URL=http://localhost:3000
```

**Port Configuration:**
- `SERVER_PORT`: Backend API port (default: 3001)
- `CLIENT_PORT`: Frontend dev server port (default: 3000)
- `FRONTEND_URL`: Auto-constructed as `http://localhost:${CLIENT_PORT}` unless explicitly set

### Step 3: Create Database

**Option A: Using SQLCMD (Command Line)**
```bash
sqlcmd -S localhost -U sa -P YourPassword123! -i database/schema.sql
```

**Option B: Using SQL Server Management Studio**
1. Open SQL Server Management Studio
2. Connect to your SQL Server
3. Open `database/schema.sql`
4. Execute the script (F5)

### Step 4: Seed Sample Data (Optional)

```bash
npm run seed
```

This will populate the database with sample employees and attendance records.

### Step 5: Start the Application

**Option A: Start Everything Together**
```bash
npm run start:all
```

**Option B: Start Separately**

Terminal 1 - Backend:
```bash
npm run server
```

Terminal 2 - Frontend:
```bash
npm run dev
```

**Note:** All server files use `.mjs` extension for ES module support. The npm scripts handle this automatically.

### Step 6: Access the Application

Open http://localhost:5173 in your browser.

---

## 📱 Available Commands

```bash
# Frontend
npm run dev              # Start frontend development server
npm run build            # Build frontend for production

# Backend
npm run server           # Start backend server
npm run server:dev       # Start backend with auto-reload

# Database
npm run seed             # Seed sample data

# All together
npm run start:all        # Start both frontend and backend
```

---

## 🔍 Verify Installation

### Check Backend is Running

```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{"status":"ok","database":"connected"}
```

### Check Frontend is Running

Open http://localhost:5173 in your browser. You should see the attendance system dashboard.

---

## 🐛 Troubleshooting

### Issue: CORS Error

**Solution:**
1. Make sure backend is running: `npm run server`
2. Check `.env` file has correct `FRONTEND_URL`
3. Restart backend after changing `.env`

### Issue: Database Connection Failed

**Solution:**
1. Verify SQL Server is running
2. Check credentials in `.env` file
3. Test connection:
   ```bash
   sqlcmd -S localhost -U sa -P YourPassword123!
   ```

### Issue: Port Already in Use

**Solution:**
Change the port in `.env` file:
```env
PORT=3002  # or any available port
```

---

## 📚 Documentation

- **README.md** - Main documentation
- **DEVICE_INTEGRATION.md** - Device integration guide
- **TROUBLESHOOTING.md** - Detailed troubleshooting guide

---

## 🎯 Next Steps

1. **Add Employees**: Go to "کارکنان" (Employees) and add your employees
2. **Record Attendance**: Use "ثبت حضور" (Clock In/Out) to record attendance
3. **View Reports**: Check "گزارشات" (Reports) for analytics
4. **Manage Devices**: If you have physical devices, configure them in "دستگاه‌ها" (Devices)

---

## 💡 Tips

- **Demo Mode**: If you don't have SQL Server, the app works in demo mode using browser storage
- **Multiple Browsers**: Data in demo mode is per-browser, use the same browser to see your data
- **Backup**: Regularly backup your SQL Server database in production
- **Devices**: Physical attendance devices can automatically sync data via Webhook or polling

---

## 🆘 Need Help?

If you encounter any issues:

1. Check the browser console (F12) for errors
2. Check the backend terminal for error logs
3. Review TROUBLESHOOTING.md for common issues
4. Verify all prerequisites are installed and running

---

## ✅ Success Checklist

- [ ] Node.js installed (v18+)
- [ ] Dependencies installed (`npm install`)
- [ ] SQL Server running (for full setup)
- [ ] Database created and schema applied
- [ ] Environment variables configured
- [ ] Backend server running (port 3001)
- [ ] Frontend dev server running (port 5173)
- [ ] Can access http://localhost:5173
- [ ] Can add employees without errors
- [ ] Can record attendance

If all checkboxes are checked, you're ready to use the attendance system! 🎉
