import { execute, executeInsert, getPool } from './db.mjs';
import * as jalaali from 'jalaali-js';

async function seedData() {
  try {
    await getPool();
    console.log('🌱 Seeding database...');

    // Seed employees first — AttendanceRecords.EmployeeId has a FK to attendance.Employees(Id).
    const SEED_EMPLOYEES = [
      { name: 'علی محمدی', personnelCode: 'P-1001', department: 'فنی و مهندسی', position: 'توسعه‌دهنده' },
      { name: 'مریم حسینی', personnelCode: 'P-1002', department: 'منابع انسانی', position: 'کارشناس HR' },
      { name: 'رضا کریمی', personnelCode: 'P-1003', department: 'مالی', position: 'حسابدار' },
      { name: 'فاطمه رضایی', personnelCode: 'P-1004', department: 'فنی و مهندسی', position: 'پشتیبانی' },
      { name: 'حسین اکبری', personnelCode: 'P-1005', department: 'عملیات', position: 'سرپرست شیفت' },
      { name: 'سارا احمدی', personnelCode: 'P-1006', department: 'منابع انسانی', position: 'مصاحبه‌گر' },
      { name: 'محمد موسوی', personnelCode: 'P-1007', department: 'فنی و مهندسی', position: 'تکنسین' },
      { name: 'زینب عباسی', personnelCode: 'P-1008', department: 'مالی', position: 'تحلیلگر' },
    ];

    let employeeIds = [];
    const existingEmployees = await execute('SELECT Id FROM attendance.Employees');
    if (existingEmployees.length > 0) {
      employeeIds = existingEmployees.map(r => r.Id);
    } else {
      for (const emp of SEED_EMPLOYEES) {
        const id = await executeInsert(
          `INSERT INTO attendance.Employees (Name, PersonnelCode, Department, Position)
           VALUES (@name, @personnelCode, @department, @position)`,
          emp
        );
        employeeIds.push(id);
      }
      console.log(`👥 Seeded ${employeeIds.length} employees.`);
    }

    const existingRecords = await execute('SELECT COUNT(*) as count FROM attendance.AttendanceRecords');
    if (existingRecords[0].count > 0) {
      console.log('⚠️  Attendance data already exists. Skipping seed.');
      process.exit(0);
      return;
    }

    const statuses = ['present', 'present', 'present', 'present', 'present', 'present', 'late', 'absent'];

    for (let i = 1; i <= 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      if (date.getDay() === 5) continue;

      const j = jalaali.toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
      const dateStr = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;

      for (let idx = 0; idx < employeeIds.length; idx++) {
        const empId = employeeIds[idx];
        const status = statuses[(idx + i) % statuses.length];

        if (status === 'absent') continue;

        const clockInHour = status === 'late' ? 8 + Math.floor(Math.random() * 2) : 7 + Math.floor(Math.random() * 1);
        const clockInMin = Math.floor(Math.random() * 60);
        const clockOutHour = 16 + Math.floor(Math.random() * 2);
        const clockOutMin = Math.floor(Math.random() * 60);


        await executeInsert(`INSERT INTO attendance.AttendanceRecords (EmployeeId, Date, ClockIn, ClockOut, Status)
           VALUES (@employeeId, @date, @clockIn, @clockOut, @status)`, { employeeId: empId, date: dateStr, clockIn: `${String(clockInHour).padStart(2, '0')}:${String(clockInMin).padStart(2, '0')}`, clockOut: `${String(clockOutHour).padStart(2, '0')}:${String(clockOutMin).padStart(2, '0')}`, status: status });
      }
    }

    console.log('✅ Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedData();
