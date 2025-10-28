
import { GoogleGenAI } from "@google/genai";
import { Order } from '../types';

// This function assumes process.env.API_KEY is available in the execution environment
const getApiKey = (): string => {
    const key = process.env.API_KEY;
    if (!key) {
        throw new Error("API_KEY environment variable not set.");
    }
    return key;
};

export const generateOrderSummary = async (orders: Order[]): Promise<string> => {
    try {
        const ai = new GoogleGenAI({ apiKey: getApiKey() });

        if (orders.length === 0) {
            return "لا توجد أوردرات لتلخيصها.";
        }

        const formattedOrders = orders.map(o => 
            `- النوع: ${o.type === 'income' ? 'استلام' : 'صرف'}, الاسم: ${o.name}, المرجع: ${o.ref || 'لا يوجد'}, الحالة: ${o.status === 'pending' ? 'قيد الانتظار' : 'مكتمل'}, التاريخ: ${new Date(o.date).toLocaleDateString('ar-EG')}`
        ).join('\n');

        const prompt = `
        أنت محلل بيانات مالي. بناءً على قائمة الأوردرات التالية باللغة العربية، قم بإنشاء ملخص موجز وواضح. 
        يجب أن يتضمن الملخص:
        1. إجمالي عدد الأوردرات.
        2. تفصيل عدد أوردرات الاستلام وعدد أوردرات الصرف.
        3. تفصيل عدد الأوردرات المكتملة وعدد الأوردرات قيد الانتظار.
        4. ملاحظة عامة أو رؤية سريعة حول النشاط إذا كان هناك شيء بارز (على سبيل المثال، "نشاط مرتفع في أوردرات الصرف").

        بيانات الأوردرات:
        ${formattedOrders}

        الرجاء تقديم الملخص باللغة العربية.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text;
    } catch (error) {
        console.error("Error generating summary with Gemini:", error);
        if (error instanceof Error && error.message.includes("API_KEY")) {
             return "خطأ: مفتاح Gemini API غير مهيأ. يرجى التأكد من إعداده بشكل صحيح.";
        }
        return "عذراً، حدث خطأ أثناء إنشاء الملخص. يرجى المحاولة مرة أخرى.";
    }
};
