#!/bin/bash

# Script to update all SQL queries to use 'attendance' schema
# Run this script from the project root

echo "🔄 Updating SQL queries to use attendance schema..."
echo ""

# List of tables to update
TABLES=(
  "Employees"
  "AttendanceRecords"
  "LeaveRequests"
  "Devices"
  "DeviceLogs"
  "DeviceAttendanceLogs"
  "SystemLogs"
  "CompanyInfo"
  "Users"
  "Roles"
  "Permissions"
  "RolePermissions"
  "UserRoles"
  "Shifts"
  "ShiftPatterns"
  "ShiftPatternPeriods"
  "WorkingHoursRules"
  "EmployeeShifts"
)

# Find all .mjs files in server directory
FILES=$(find server -name "*.mjs" -type f)

for file in $FILES; do
  echo "Processing: $file"
  
  for table in "${TABLES[@]}"; do
    # Replace table references with schema prefix
    # Be careful not to replace if already has attendance. prefix
    sed -i "s/\bFROM $table\b/FROM attendance.$table/g" "$file"
    sed -i "s/\bINTO $table\b/INTO attendance.$table/g" "$file"
    sed -i "s/\bUPDATE $table\b/UPDATE attendance.$table/g" "$file"
    sed -i "s/\bDELETE FROM $table\b/DELETE FROM attendance.$table/g" "$file"
    sed -i "s/\bJOIN $table\b/JOIN attendance.$table/g" "$file"
  done
  
  # Fix double schema prefix (if already had attendance.)
  sed -i "s/attendance\.attendance\./attendance./g" "$file"
done

echo ""
echo "✅ All files updated successfully!"
echo ""
echo "Next steps:"
echo "1. Run database/schema.sql to create tables with attendance schema"
echo "2. Run database/clean-db.sql to insert initial data"
echo "3. Run npm run seed:admin to set admin password"
echo "4. Start the server: npm run server"
