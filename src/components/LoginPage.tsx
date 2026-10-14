import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { LogIn, Lock, User, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const toast = useToast();
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.username.trim()) {
      newErrors.username = 'نام کاربری الزامی است';
    }

    if (!formData.password) {
      newErrors.password = 'رمز عبور الزامی است';
    } else if (formData.password.length < 6) {
      newErrors.password = 'رمز عبور باید حداقل 6 کاراکتر باشد';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.warning('لطفاً فرم را به درستی پر کنید');
      return;
    }

    try {
      setIsLoading(true);
      await login(formData.username, formData.password);
      toast.success('ورود موفقیت‌آمیز', 'خوش آمدید!');
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error('خطا در ورود', error.message || 'نام کاربری یا رمز عبور اشتباه است');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] p-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#0A6ED1] rounded-2xl mb-4">
            <LogIn size={32} className="text-white" />
          </div>
          <h1 className="ent-h1 mb-2">سیستم حضور و غیاب</h1>
          <p className="ent-body">برای ادامه وارد حساب کاربری خود شوید</p>
        </div>

        {/* Login Form */}
        <div className="ent-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="ent-form-group">
              <label className="ent-form-label flex items-center gap-2">
                <User size={16} className="text-[#5A5E63]" />
                نام کاربری
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => {
                  setFormData({ ...formData, username: e.target.value });
                  if (errors.username) setErrors({ ...errors, username: '' });
                }}
                className={`ent-input ${errors.username ? 'border-[#BB0000]' : ''}`}
                placeholder="نام کاربری خود را وارد کنید"
                disabled={isLoading}
                autoFocus
              />
              {errors.username && (
                <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {errors.username}
                </p>
              )}
            </div>

            <div className="ent-form-group">
              <label className="ent-form-label flex items-center gap-2">
                <Lock size={16} className="text-[#5A5E63]" />
                رمز عبور
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value });
                  if (errors.password) setErrors({ ...errors, password: '' });
                }}
                className={`ent-input ${errors.password ? 'border-[#BB0000]' : ''}`}
                placeholder="رمز عبور خود را وارد کنید"
                disabled={isLoading}
              />
              {errors.password && (
                <p className="text-[#BB0000] text-xs mt-1 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {errors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="ent-btn-primary w-full flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>در حال ورود...</span>
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  <span>ورود به سیستم</span>
                </>
              )}
            </button>
          </form>

          {/* Help Text */}
          <div className="mt-6 pt-6 border-t border-[#E5E5E5]">
            <p className="ent-caption text-center">
              نام کاربری پیش‌فرض: <span className="font-mono font-semibold">admin</span>
              <br />
              رمز عبور پیش‌فرض: <span className="font-mono font-semibold">admin123</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="ent-caption text-center mt-6">
          © 2024 سیستم حضور و غیاب - تمامی حقوق محفوظ است
        </p>
      </div>
    </div>
  );
}
