
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, UserRole, Order, OrderType, OrderStatus } from './types';
import { SUPER_ADMIN_EMAIL } from './constants';
import { SunIcon, MoonIcon, EyeIcon, EyeOffIcon, ChevronDownIcon, TrashIcon, FileDownIcon, XIcon } from './components/Icons';
import { generateOrderSummary } from './services/geminiService';
import * as firebaseService from './services/firebaseService';

declare const jspdf: any;

// --- HELPER FUNCTIONS ---
const toArabicNumerals = (numStr: string | number | undefined): string => {
    if (numStr === undefined || numStr === null) return '';
    const str = String(numStr);
    const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return str.replace(/[0-9]/g, (w) => arabicNumerals[+w]);
};

// --- HELPER COMPONENTS (defined outside main component) ---

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}
const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
  return (
    <div className={`fixed bottom-5 left-5 text-white p-4 rounded-lg shadow-lg z-50 animate-fade-in ${bgColor}`}>
      {message}
      <button onClick={onClose} className="absolute top-1 right-1 p-1">
        <XIcon className="w-4 h-4" />
      </button>
    </div>
  );
};

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}
const ConfirmModal: React.FC<ConfirmModalProps> = ({ title, message, onConfirm, onCancel, confirmText = "تأكيد", cancelText = "إلغاء" }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm text-center">
      <h3 className="text-lg font-bold mb-4">{title}</h3>
      <p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
      <div className="flex justify-center gap-4">
        <button onClick={onCancel} className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
          {cancelText}
        </button>
        <button onClick={onConfirm} className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors active:scale-95">
          {confirmText}
        </button>
      </div>
    </div>
  </div>
);

// --- MAIN APP COMPONENT ---

export default function App() {
  // State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoginView, setIsLoginView] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filters and Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [sortOption, setSortOption] = useState('date-desc');
  
  // UI State
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalProps | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<string>('');
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(false);
  
  // Effects
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const unsubscribe = firebaseService.onAuthStateChangedListener(async (user) => {
      if (user) {
        const fullUser = await firebaseService.getUser(user.uid);
        setCurrentUser(fullUser);
      } else {
        setCurrentUser(null);
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (currentUser) {
      const unsubscribeUsers = firebaseService.getUsers(setUsers);
      const unsubscribeOrders = firebaseService.getOrders(setOrders);
      return () => {
        unsubscribeUsers();
        unsubscribeOrders();
      };
    } else {
      setUsers([]);
      setOrders([]);
    }
  }, [currentUser]);
  
  // Memos for performance
  const filteredAndSortedOrders = useMemo(() => {
    let filtered = orders.filter(order => {
      const lowerSearchTerm = searchTerm.toLowerCase();
      const matchesSearch = 
        order.name.toLowerCase().includes(lowerSearchTerm) ||
        (order.ref && order.ref.toLowerCase().includes(lowerSearchTerm));
      const matchesDate = !dateFilter || order.date.startsWith(dateFilter);
      const matchesStatus = !statusFilter || order.status === statusFilter;
      return matchesSearch && matchesDate && matchesStatus;
    });

    return filtered.sort((a, b) => {
      switch (sortOption) {
        case 'date-asc': return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'name-asc': return a.name.localeCompare(b.name, 'ar');
        case 'name-desc': return b.name.localeCompare(a.name, 'ar');
        case 'ref-asc': return (a.ref || '').localeCompare(b.ref || '', undefined, { numeric: true });
        case 'ref-desc': return (b.ref || '').localeCompare(a.ref || '', undefined, { numeric: true });
        default: return new Date(b.date).getTime() - new Date(a.date).getTime(); // date-desc
      }
    });
  }, [orders, searchTerm, dateFilter, sortOption, statusFilter]);

  const incomeOrders = useMemo(() => filteredAndSortedOrders.filter(o => o.type === 'income'), [filteredAndSortedOrders]);
  const expenseOrders = useMemo(() => filteredAndSortedOrders.filter(o => o.type === 'expense'), [filteredAndSortedOrders]);

  // Callbacks
  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };
  
  const handleRegister = async (email: string, pass: string) => {
    const { error } = await firebaseService.registerWithEmail(email, pass);
    if (error) {
        showToast(error, 'error');
    } else {
        showToast('تم إنشاء الحساب بنجاح! يمكنك الآن تسجيل الدخول.', 'success');
        setIsLoginView(true);
    }
  };

  const handleLogin = async (email: string, pass: string) => {
    const { error } = await firebaseService.loginWithEmail(email, pass);
    if (error) {
        showToast(error, 'error');
    } else {
        showToast(`مرحباً بعودتك!`, 'success');
    }
  };

  const handleLogout = () => {
    firebaseService.logout();
    showToast('تم تسجيل الخروج بنجاح.', 'success');
  };

  const handleAddOrder = (name: string, ref: string, type: OrderType, date: string) => {
    if (!currentUser) return;
    const newOrder: Omit<Order, 'id'> = {
      name,
      ref,
      type,
      status: 'pending',
      date: date,
      addedBy: currentUser.email,
    };
    firebaseService.addOrder(newOrder);
    showToast('تمت إضافة الأوردر بنجاح!', 'success');
  };

  const toggleOrderStatus = (order: Order) => {
    const newStatus = order.status === 'pending' ? 'completed' : 'pending';
    firebaseService.updateOrder(order.id, { status: newStatus });
  };

  const handleDeleteSelected = () => {
    if (selectedOrders.size === 0) return;
    setConfirmModal({
        title: "تأكيد الحذف",
        message: `هل أنت متأكد من رغبتك في حذف ${selectedOrders.size} أوردر(ات)؟ لا يمكن التراجع عن هذا الإجراء.`,
        onConfirm: async () => {
            await firebaseService.deleteOrders(Array.from(selectedOrders));
            setSelectedOrders(new Set());
            showToast('تم حذف الأوردرات المحددة بنجاح.', 'success');
            setConfirmModal(null);
        },
        onCancel: () => setConfirmModal(null),
        confirmText: "نعم، احذف"
    });
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (type: OrderType) => {
    const ordersToSelect = type === 'income' ? incomeOrders : expenseOrders;
    const allVisibleSelected = ordersToSelect.every(o => selectedOrders.has(o.id));
    
    setSelectedOrders(prev => {
        const newSet = new Set(prev);
        if (allVisibleSelected) {
            ordersToSelect.forEach(o => newSet.delete(o.id));
        } else {
            ordersToSelect.forEach(o => newSet.add(o.id));
        }
        return newSet;
    });
  };

  const handleUserRoleChange = (userId: string, newRole: UserRole) => {
    firebaseService.updateUserRole(userId, newRole);
  };
  
  const escapeCsvField = (field: string | undefined): string => {
    if (field === null || field === undefined) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  
  const handleExportCSV = () => {
      const headers = ['النوع', 'الاسم', 'الرقم المرجعي', 'التاريخ', 'الحالة', 'أضيف بواسطة'];
      const rows = filteredAndSortedOrders.map(o => [
          o.type === 'income' ? 'استلام' : 'صرف',
          o.name,
          o.ref || '',
          new Date(o.date).toLocaleDateString('ar-EG'),
          o.status === 'pending' ? 'قيد الانتظار' : 'مكتمل',
          o.addedBy
      ].map(escapeCsvField));

      let csvContent = "\uFEFF"; // BOM for UTF-8
      csvContent += headers.join(",") + "\r\n";
      rows.forEach(rowArray => {
          let row = rowArray.join(",");
          csvContent += row + "\r\n";
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `تقرير_الأوردرات_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('تم تصدير CSV بنجاح.', 'success');
  };

  const handleExportPDF = async () => {
    if (filteredAndSortedOrders.length === 0) {
        showToast('لا توجد بيانات لتصديرها.', 'error');
        return;
    }
    showToast('جاري تحضير ملف PDF...', 'success');
    
    // Helper function to convert ArrayBuffer to base64
    const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    };

    try {
        // Fetch Amiri font from a reliable external source
        const fontUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Regular.ttf';
        const fontResponse = await fetch(fontUrl);
        if (!fontResponse.ok) {
            throw new Error(`Failed to download font: ${fontResponse.statusText}`);
        }
        const fontBuffer = await fontResponse.arrayBuffer();
        const fontBase64 = arrayBufferToBase64(fontBuffer);

        const { jsPDF } = jspdf;
        const doc = new jsPDF();

        // Step 1: Add the dynamically fetched font
        doc.addFileToVFS('Amiri-Regular.ttf', fontBase64);
        doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
        
        // Step 2: Set font for the title
        doc.setFont('Amiri', 'normal');
        const title = "تقرير الأوردرات";
        doc.setFontSize(20);
        doc.text(title, doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });

        // Step 3: Prepare table data (reversed for RTL and with English numerals)
        const head = [['أضيف بواسطة', 'الحالة', 'التاريخ', 'الرقم المرجعي', 'الاسم', 'النوع']];
        const body = filteredAndSortedOrders.map(o => [
            o.addedBy,
            o.status === 'pending' ? 'قيد الانتظار' : 'مكتمل',
            new Date(o.date).toISOString().split('T')[0], // Use English numerals in YYYY-MM-DD format
            o.ref || 'N/A', // Use English numerals
            o.name,
            o.type === 'income' ? 'استلام' : 'صرف',
        ]);

        // Step 4: Use autoTable correctly
        (doc as any).autoTable({
            head,
            body,
            startY: 30,
            theme: 'grid',
            headStyles: { 
                fillColor: [22, 160, 133],
            },
            didParseCell: function (data: any) {
                data.cell.styles.font = 'Amiri';
                data.cell.styles.fontStyle = 'normal';
                
                if (data.section === 'head') {
                    data.cell.styles.halign = 'center';
                } else {
                    data.cell.styles.halign = 'right';
                }
            },
        });

        doc.save(`تقرير_الأوردرات_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('تم تصدير PDF بنجاح.', 'success');
    } catch (error) {
        console.error("Error exporting PDF:", error);
        showToast('حدث خطأ أثناء تحميل الخط أو تصدير PDF.', 'error');
    }
  };

  const handleGenerateSummary = async () => {
    if (isSummaryLoading) return;
    setIsSummaryLoading(true);
    setSummary('');
    const result = await generateOrderSummary(filteredAndSortedOrders);
    setSummary(result);
    setIsSummaryLoading(false);
  };

  // Rendering
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin-slow"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} isLoginView={isLoginView} setIsLoginView={setIsLoginView} />;
  }
  
  const isAdmin = currentUser.role === 'admin';

  return (
    <div className="min-h-screen">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirmModal && <ConfirmModal {...confirmModal} />}
      {isAdminPanelOpen && <AdminPanel users={users} currentUser={currentUser} onClose={() => setIsAdminPanelOpen(false)} onRoleChange={handleUserRoleChange} />}

      <Header user={currentUser} onLogout={handleLogout} toggleTheme={toggleTheme} theme={theme} onAdminPanelOpen={() => setIsAdminPanelOpen(true)} />
      
      <main className="container mx-auto p-4 md:p-6 lg:p-8 animate-fade-in">
        {isAdmin && <AddOrderForm onAddOrder={handleAddOrder} />}
        
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md mb-6">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <input
                    type="text"
                    placeholder="ابحث بالاسم أو الرقم المرجعي..."
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                <input
                    type="date"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={dateFilter}
                    onChange={e => setDateFilter(e.target.value)}
                />
                <select
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as OrderStatus | '')}
                >
                    <option value="">كل الحالات</option>
                    <option value="pending">قيد الانتظار</option>
                    <option value="completed">مكتمل</option>
                </select>
                <select
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={sortOption}
                    onChange={e => setSortOption(e.target.value)}
                >
                    <option value="date-desc">التاريخ (الأحدث أولاً)</option>
                    <option value="date-asc">التاريخ (الأقدم أولاً)</option>
                    <option value="name-asc">الاسم (أ - ي)</option>
                    <option value="name-desc">الاسم (ي - أ)</option>
                    <option value="ref-asc">الرقم المرجعي (تصاعدي)</option>
                    <option value="ref-desc">الرقم المرجعي (تنازلي)</option>
                </select>
            </div>
            <div className="flex flex-wrap gap-2 justify-between items-center">
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => { setSearchTerm(''); setDateFilter(''); setSortOption('date-desc'); setStatusFilter(''); }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95">
                        مسح الفلاتر
                    </button>
                    <div className="relative group">
                        <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors active:scale-95 flex items-center gap-2">
                            <FileDownIcon className="w-4 h-4" />
                            <span>تصدير</span>
                        </button>
                        <div className="absolute hidden group-hover:block bg-white dark:bg-gray-700 rounded-md shadow-lg z-10 w-32">
                           <a href="#" onClick={(e) => { e.preventDefault(); handleExportCSV(); }} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600">CSV</a>
                           <a href="#" onClick={(e) => { e.preventDefault(); handleExportPDF(); }} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600">PDF</a>
                        </div>
                    </div>
                </div>
                {isAdmin && selectedOrders.size > 0 && (
                    <button onClick={handleDeleteSelected} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors active:scale-95 flex items-center gap-2 animate-fade-in">
                        <TrashIcon className="w-4 h-4"/>
                        <span>مسح المحدد ({toArabicNumerals(selectedOrders.size)})</span>
                    </button>
                )}
            </div>
        </div>

        { isAdmin && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md mb-6 animate-fade-in">
            <h3 className="text-xl font-bold mb-3 text-gray-800 dark:text-gray-100">ملخص ذكي</h3>
            <button onClick={handleGenerateSummary} disabled={isSummaryLoading} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors active:scale-95 disabled:bg-indigo-400 disabled:cursor-not-allowed">
              {isSummaryLoading ? 'جاري الإنشاء...' : 'إنشاء ملخص باستخدام Gemini'}
            </button>
            {isSummaryLoading && <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin-slow my-4"></div>}
            {summary && <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-md whitespace-pre-wrap">{summary}</div>}
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <OrderTable
            title="سجل المصروفات"
            orders={expenseOrders}
            type="expense"
            isAdmin={isAdmin}
            selectedOrders={selectedOrders}
            onSelectOrder={handleSelectOrder}
            onSelectAll={handleSelectAll}
            onStatusToggle={toggleOrderStatus}
          />
          <OrderTable
            title="سجل الاستلامات"
            orders={incomeOrders}
            type="income"
            isAdmin={isAdmin}
            selectedOrders={selectedOrders}
            onSelectOrder={handleSelectOrder}
            onSelectAll={handleSelectAll}
            onStatusToggle={toggleOrderStatus}
          />
        </div>
      </main>
    </div>
  );
}

// --- SUB-COMPONENTS ---
const Header: React.FC<{
  user: User;
  onLogout: () => void;
  toggleTheme: () => void;
  theme: 'light' | 'dark';
  onAdminPanelOpen: () => void;
}> = ({ user, onLogout, toggleTheme, theme, onAdminPanelOpen }) => {
  const roleColor = user.role === 'admin' ? 'bg-blue-500 text-white' : 'bg-gray-500 text-white';
  return (
    <header className="sticky top-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-md z-40">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">متتبع الأوردرات</h1>
        <div className="flex items-center gap-3 md:gap-4">
          <div className="text-right">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 hidden sm:block">{user.email}</div>
              <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${roleColor}`}>
                  {user.role === 'admin' ? 'أدمن' : 'ضيف'}
              </div>
          </div>
          {user.role === 'admin' && (
              <button onClick={onAdminPanelOpen} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="إدارة الصلاحيات">
                  <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </button>
          )}
          <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="تبديل الثيم">
            {theme === 'light' ? <MoonIcon className="w-6 h-6" /> : <SunIcon className="w-6 h-6" />}
          </button>
          <button onClick={onLogout} className="px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors active:scale-95">تسجيل الخروج</button>
        </div>
      </div>
    </header>
  );
};

const AddOrderForm: React.FC<{onAddOrder: (name: string, ref: string, type: OrderType, date: string) => void}> = ({ onAddOrder }) => {
    const [name, setName] = useState('');
    const [ref, setRef] = useState('');
    const [type, setType] = useState<OrderType>('expense');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(!name) return;
        onAddOrder(name, ref, type, date);
        setName('');
        setRef('');
        setDate(new Date().toISOString().split('T')[0]);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md mb-6 animate-fade-in">
            <h3 className="text-xl font-bold mb-4">إضافة أوردر جديد</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                <div className="md:col-span-2">
                    <label htmlFor="name" className="block text-sm font-medium mb-1">الاسم (العميل/المورد)</label>
                    <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div>
                    <label htmlFor="ref" className="block text-sm font-medium mb-1">الرقم المرجعي (اختياري)</label>
                    <input id="ref" type="text" value={ref} onChange={e => setRef(e.target.value)} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div>
                    <label htmlFor="date" className="block text-sm font-medium mb-1">تاريخ الأوردر</label>
                    <input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div className="flex gap-2">
                    <button type="submit" onClick={() => setType('expense')} className="flex-1 px-4 py-2 font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors active:scale-95">صرف</button>
                    <button type="submit" onClick={() => setType('income')} className="flex-1 px-4 py-2 font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors active:scale-95">استلام</button>
                </div>
            </form>
        </div>
    );
};

const OrderTable: React.FC<{
  title: string;
  orders: Order[];
  type: OrderType;
  isAdmin: boolean;
  selectedOrders: Set<string>;
  onSelectOrder: (orderId: string) => void;
  onSelectAll: (type: OrderType) => void;
  onStatusToggle: (order: Order) => void;
}> = ({ title, orders, type, isAdmin, selectedOrders, onSelectOrder, onSelectAll, onStatusToggle }) => {
  const allVisibleSelected = orders.length > 0 && orders.every(o => selectedOrders.has(o.id));

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md overflow-x-auto">
      <h3 className="text-xl font-bold mb-4">{title}</h3>
      <table className="w-full text-right responsive-table">
        <thead className="border-b dark:border-gray-600">
          <tr>
            {isAdmin && <th className="p-2"><input type="checkbox" checked={allVisibleSelected} onChange={() => onSelectAll(type)} className="form-checkbox h-5 w-5 rounded text-blue-600" /></th>}
            <th className="p-2">الاسم</th>
            <th className="p-2">الرقم المرجعي</th>
            <th className="p-2">التاريخ</th>
            <th className="p-2">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <tr><td colSpan={isAdmin ? 5 : 4} className="text-center p-4">لا توجد بيانات لعرضها.</td></tr>
          ) : (
            orders.map(order => {
              const statusBg = order.status === 'completed' 
                ? 'bg-green-100 dark:bg-green-900/50' 
                : 'bg-yellow-100 dark:bg-yellow-900/50';
              const selectedBg = selectedOrders.has(order.id) ? 'bg-blue-100 dark:bg-blue-900/60' : '';
              
              return (
                <tr key={order.id} className={`border-b dark:border-gray-700 transition-colors ${selectedBg || statusBg}`}>
                  {isAdmin && (
                    <td data-label="تحديد" className="p-2"><input type="checkbox" checked={selectedOrders.has(order.id)} onChange={() => onSelectOrder(order.id)} className="form-checkbox h-5 w-5 rounded text-blue-600"/></td>
                  )}
                  <td data-label="الاسم" className="p-2 font-medium truncate">{order.name}</td>
                  <td data-label="الرقم المرجعي" className="p-2 text-gray-600 dark:text-gray-400">{toArabicNumerals(order.ref || 'N/A')}</td>
                  <td data-label="التاريخ" className="p-2 text-sm text-gray-500 dark:text-gray-400">{toArabicNumerals(new Date(order.date).toLocaleDateString('ar-EG'))}</td>
                  <td data-label="الحالة" className="p-2">
                    {isAdmin ? (
                      <button onClick={() => onStatusToggle(order)} className={`px-3 py-1 text-sm font-semibold rounded-full w-24 text-center transition-colors ${order.status === 'completed' ? 'bg-green-200 text-green-800 dark:bg-green-700 dark:text-green-100' : 'bg-yellow-200 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100'}`}>
                        {order.status === 'completed' ? 'مكتمل' : 'قيد الانتظار'}
                      </button>
                    ) : (
                      <span className={`px-3 py-1 text-sm font-semibold rounded-full ${order.status === 'completed' ? 'bg-green-200 text-green-800 dark:bg-green-700 dark:text-green-100' : 'bg-yellow-200 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100'}`}>
                        {order.status === 'completed' ? 'مكتمل' : 'قيد الانتظار'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};


const AuthScreen: React.FC<{
  onLogin: (email: string, pass: string) => void;
  onRegister: (email: string, pass: string) => void;
  isLoginView: boolean;
  setIsLoginView: (isLogin: boolean) => void;
}> = ({ onLogin, onRegister, isLoginView, setIsLoginView }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoginView) {
            onLogin(email, password);
        } else {
            onRegister(email, password);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-gray-900 p-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 animate-fade-in">
                <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-6">
                    {isLoginView ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">البريد الإلكتروني</label>
                        <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1 w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"/>
                    </div>
                    <div className="relative">
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">كلمة المرور</label>
                        <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required className="mt-1 w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"/>
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute bottom-2.5 left-3 text-gray-500 dark:text-gray-400">
                            {showPassword ? <EyeOffIcon className="w-6 h-6"/> : <EyeIcon className="w-6 h-6"/>}
                        </button>
                    </div>
                    <button type="submit" className="w-full py-3 px-4 text-white font-semibold bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors active:scale-95">
                        {isLoginView ? 'دخول' : 'إنشاء حساب'}
                    </button>
                </form>
                <p className="mt-6 text-center text-sm">
                    {isLoginView ? 'ليس لديك حساب؟ ' : 'لديك حساب بالفعل؟ '}
                    <button onClick={() => setIsLoginView(!isLoginView)} className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                        {isLoginView ? 'أنشئ حساباً' : 'سجل الدخول'}
                    </button>
                </p>
            </div>
        </div>
    );
};

const AdminPanel: React.FC<{
    users: User[];
    currentUser: User;
    onClose: () => void;
    onRoleChange: (userId: string, newRole: UserRole) => void;
}> = ({ users, currentUser, onClose, onRoleChange }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl animate-fade-in max-h-[90vh] flex flex-col">
                <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                    <h3 className="text-xl font-bold">إدارة صلاحيات المستخدمين</h3>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><XIcon className="w-6 h-6"/></button>
                </div>
                <div className="p-4 overflow-y-auto">
                    <table className="w-full text-right">
                        <thead>
                            <tr className="border-b dark:border-gray-600">
                                <th className="p-2">البريد الإلكتروني</th>
                                <th className="p-2">الدور الحالي</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id} className="border-b dark:border-gray-700">
                                    <td className="p-2">{user.email}</td>
                                    <td className="p-2">
                                        {user.email === SUPER_ADMIN_EMAIL ? (
                                            <span className="font-bold text-blue-600 dark:text-blue-400">أدمن رئيسي</span>
                                        ) : (
                                            <select 
                                                value={user.role} 
                                                onChange={(e) => onRoleChange(user.id, e.target.value as UserRole)}
                                                disabled={currentUser.email !== SUPER_ADMIN_EMAIL}
                                                className="p-1 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <option value="guest">ضيف</option>
                                                <option value="admin">أدمن</option>
                                            </select>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                 <div className="p-4 border-t dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                    * الأدمن الرئيسي فقط يمكنه تغيير صلاحيات المستخدمين الآخرين.
                </div>
            </div>
        </div>
    );
};
