import { Router } from 'express';
import { execute } from '../db.mjs';
import { Logger } from '../services/logger.mjs';

import { authenticateToken } from '../services/auth.mjs';

const router = Router();

// Phase 0 (route-auth enforcement): every endpoint on this router
// requires a valid session token. Public auth endpoints live only under /api/auth.
router.use(authenticateToken);

// Get company info
router.get('/', async (req, res) => {
  try {
    const result = await execute('SELECT * FROM attendance.CompanyInfo WHERE Id = @id', { id: 'default' });
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'اطلاعات شرکت یافت نشد' });
    }
    
    res.json(result[0]);
  } catch (error) {
    await Logger.error('READ', 'company', null, 'خطا در دریافت اطلاعات شرکت', { error: error.message });
    res.status(500).json({ error: 'خطا در دریافت اطلاعات شرکت' });
  }
});

// Update company info
router.put('/', async (req, res) => {
  try {
    const { Name, Logo, Address, Phone, Email, Website, WorkStartTime, WorkEndTime, LateThreshold } = req.body;
    
    await execute(
      `UPDATE attendance.CompanyInfo 
       SET Name = @name, Logo = @logo, Address = @address, Phone = @phone, 
           Email = @email, Website = @website, WorkStartTime = @workStartTime, 
           WorkEndTime = @workEndTime, LateThreshold = @lateThreshold, UpdatedAt = GETDATE()
       WHERE Id = @id`,
      {
        id: 'default',
        name: Name,
        logo: Logo,
        address: Address,
        phone: Phone,
        email: Email,
        website: Website,
        workStartTime: WorkStartTime,
        workEndTime: WorkEndTime,
        lateThreshold: LateThreshold
      }
    );
    
    await Logger.info('UPDATE', 'company', null, 'اطلاعات شرکت به‌روزرسانی شد', { userId: req.user?.id });
    res.json({ message: 'اطلاعات شرکت با موفقیت به‌روزرسانی شد' });
  } catch (error) {
    await Logger.error('UPDATE', 'company', null, 'خطا در به‌روزرسانی اطلاعات شرکت', { error: error.message });
    res.status(500).json({ error: 'خطا در به‌روزرسانی اطلاعات شرکت' });
  }
});

export default router;
