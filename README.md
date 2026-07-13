# Money Tracker

เว็บแอป static สำหรับจดรายรับรายจ่ายและวางแผนงบประมาณ ใช้ HTML/CSS/JavaScript ล้วน ไม่มี build step

## หน้าเว็บ

- `index.html` - หน้าจดรายรับรายจ่ายรายวัน พร้อมกราฟและการเชื่อมต่อ Google Sheets
- `finance-tracker.html` - หน้าแผนงบประมาณ เงินเดือน รายจ่ายประจำ เงินเก็บ และเงินเหลือใช้ต่อวัน ใช้ Google Sheets URL เดียวกับหน้ารายการ
- `finance-tracker (1).html` - ทางลัด redirect ไป `finance-tracker.html`
- `Code.gs` - Google Apps Script backend สำหรับอ่าน/เขียนรายการลง Google Sheet

## ใช้งาน

เปิด `index.html` หรือ `finance-tracker.html` ใน browser ได้เลย ทั้งสองหน้ามีปุ่มสลับหน้าอยู่ด้านบน

ถ้ายังไม่เชื่อม Google Sheets ข้อมูลจะถูกเก็บไว้ใน `localStorage` ของ browser นั้นก่อน หลังเชื่อมต่อแล้ว:

- รายการรายรับรายจ่ายจะอยู่ในชีต `Transactions`
- แผนงบประมาณจะอยู่ในชีต `BudgetProfile`

## ตั้งค่า Google Sheets

1. สร้าง Google Sheet ใหม่
2. ไปที่ `Extensions > Apps Script`
3. ลบโค้ดตั้งต้น แล้ววางเนื้อหาใน `Code.gs`
4. กด `Deploy > New deployment`
5. เลือกชนิด `Web app`
6. ตั้งค่า `Execute as: Me`
7. ตั้งค่า `Who has access: Anyone`
8. Deploy และอนุญาตสิทธิ์
9. คัดลอก Web app URL ที่ลงท้ายด้วย `/exec`
10. เปิด `index.html` แล้วกด `Google Sheets`
11. วาง URL และกด `ทดสอบและเชื่อมต่อ`

หลังเชื่อมต่อสำเร็จ รายการที่เพิ่ม แก้ไข หรือลบใน `index.html` จะอัปเดต Google Sheet โดยตรง และหน้า `finance-tracker.html` จะใช้ URL เดียวกันเพื่อโหลด/บันทึกแผนงบ

## หมายเหตุ

ถ้าแก้ไข `Code.gs` ในภายหลัง ต้องสร้าง deployment version ใหม่ใน Google Apps Script ไม่อย่างนั้น URL เดิมจะยังใช้โค้ดเวอร์ชันเก่า
