#!/usr/bin/env node

/**
 * Script to update all SQL queries to use 'attendance' schema
 * Run this script once to update all backend files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routesDir = path.join(__dirname, 'routes');
const servicesDir = path.join(__dirname, 'services');

// Tables to update
const tables = [
  'Employees',
  'AttendanceRecords',
  'LeaveRequests',
  'Devices',
  'DeviceLogs',
  'DeviceAttendanceLogs',
  'SystemLogs',
  'CompanyInfo',
  'Users',
  'Roles',
  'Permissions',
  'RolePermissions',
  'UserRoles',
  'Shifts',
  'ShiftPatterns',
  'ShiftPatternPeriods',
  'WorkingHoursRules',
  'EmployeeShifts'
];

// Function to update SQL queries in a file
function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = false;

  // Update table references
  tables.forEach(table => {
    // Pattern: FROM TableName, INTO TableName, UPDATE TableName, DELETE FROM TableName
    const patterns = [
      new RegExp(`\\bFROM\\s+${table}\\b`, 'gi'),
      new RegExp(`\\bINTO\\s+${table}\\b`, 'gi'),
      new RegExp(`\\bUPDATE\\s+${table}\\b`, 'gi'),
      new RegExp(`\\bDELETE\\s+FROM\\s+${table}\\b`, 'gi'),
      new RegExp(`\\bJOIN\\s+${table}\\b`, 'gi'),
    ];

    patterns.forEach(pattern => {
      if (pattern.test(content)) {
        content = content.replace(pattern, (match) => {
          // Don't replace if already has attendance. prefix
          if (match.includes('attendance.')) {
            return match;
          }
          return match.replace(table, `attendance.${table}`);
        });
        updated = true;
      }
    });
  });

  if (updated) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Updated: ${path.basename(filePath)}`);
  } else {
    console.log(`⏭️  No changes: ${path.basename(filePath)}`);
  }
}

// Process all .mjs files in routes directory
console.log('🔄 Updating SQL queries to use attendance schema...\n');

if (fs.existsSync(routesDir)) {
  const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.mjs'));
  routeFiles.forEach(file => {
    updateFile(path.join(routesDir, file));
  });
}

if (fs.existsSync(servicesDir)) {
  const serviceFiles = fs.readdirSync(servicesDir).filter(f => f.endsWith('.mjs'));
  serviceFiles.forEach(file => {
    updateFile(path.join(servicesDir, file));
  });
}

console.log('\n✅ All files updated successfully!');
console.log('\nNext steps:');
console.log('1. Run database/schema.sql to create tables with attendance schema');
console.log('2. Run database/clean-db.sql to insert initial data');
console.log('3. Run npm run seed:admin to set admin password');
console.log('4. Start the server: npm run server');
