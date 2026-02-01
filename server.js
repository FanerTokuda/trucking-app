const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
// THAY ĐỔI 1: Để Render tự cấp Port hoặc dùng 5000 nếu chạy local
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// THAY ĐỔI 2: Cấu hình để server hiển thị file trong thư mục public và uploads
app.use(express.static('public')); 
app.use('/uploads', express.static('uploads'));

// Cấu hình Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // Encoding tên file để tránh lỗi ký tự đặc biệt
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

mongoose.connect('mongodb+srv://anhtuanbl123:anhtuanbl123@cluster0.ltknaud.mongodb.net/?appName=Cluster0')
    .then(() => console.log('✅ Đã kết nối MongoDB!'))
    .catch(err => console.error('❌ Lỗi DB:', err));

const CarrierSchema = new mongoose.Schema({
    name: String, taxCode: String, key: String,
    createdAt: { type: Date, default: Date.now }
});
const CarrierModel = mongoose.model('Carrier', CarrierSchema);

// === SCHEMA MỚI: DÙNG MẢNG INVOICES ===
const TruckingSchema = new mongoose.Schema({
    carrier: String,   
    operationType: String,
    booking: String,
    container: String,
    cost: Number,
    revenue: Number,
    paymentStatus: { type: String, default: 'unpaid' },
    
    // Mảng chứa danh sách file
    invoices: [{ 
        path: String, 
        originalName: String 
    }],
    
    createdAt: { type: Date, default: Date.now }
});
const TruckingModel = mongoose.model('Trucking', TruckingSchema);

// --- API ROUTES ---

app.get('/api/carriers', async (req, res) => {
    try { const data = await CarrierModel.find().sort({ name: 1 }); res.json(data); } catch (err) { res.status(500).json(err); }
});
app.post('/api/carriers', async (req, res) => {
    try {
        if (await CarrierModel.findOne({ name: req.body.name, taxCode: req.body.taxCode })) return res.status(400).json({ error: "Trùng nhà xe!" });
        const newItem = new CarrierModel(req.body); await newItem.save(); res.json(newItem);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/carriers/:id', async (req, res) => {
    try { await CarrierModel.findByIdAndDelete(req.params.id); res.json({ message: "Deleted" }); } catch (err) { res.status(500).json(err); }
});

// --- BOOKING ---
app.get('/api/trucking', async (req, res) => {
    try { const data = await TruckingModel.find().sort({ createdAt: -1 }); res.json(data); } catch (err) { res.status(500).json(err); }
});

// Thêm mới (Upload nhiều file)
app.post('/api/trucking', upload.array('invoiceFiles', 10), async (req, res) => {
    try {
        const data = req.body;
        data.invoices = [];

        // Duyệt qua danh sách file tải lên
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                data.invoices.push({
                    path: file.path.replace(/\\/g, "/"),
                    originalName: file.originalname
                });
            });
        }
        
        const newItem = new TruckingModel(data); await newItem.save(); res.json(newItem);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Sửa (Append thêm file mới vào danh sách cũ)
app.put('/api/trucking/:id', upload.array('invoiceFiles', 10), async (req, res) => {
    try {
        const item = await TruckingModel.findById(req.params.id);
        if (!item) return res.status(404).json({error: "Not found"});

        // Cập nhật thông tin text
        item.carrier = req.body.carrier;
        item.operationType = req.body.operationType;
        item.booking = req.body.booking;
        item.container = req.body.container;
        item.cost = req.body.cost;
        item.revenue = req.body.revenue;
        item.paymentStatus = req.body.paymentStatus;

        // Nếu có file mới, push thêm vào mảng cũ
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                item.invoices.push({
                    path: file.path.replace(/\\/g, "/"),
                    originalName: file.originalname
                });
            });
        }

        await item.save();
        res.json({ message: "Updated" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/trucking/:id', async (req, res) => {
    try {
        const item = await TruckingModel.findById(req.params.id);
        if (item && item.invoices) {
            // Xóa tất cả file đính kèm trước khi xóa record
            item.invoices.forEach(file => {
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            });
        }
        await TruckingModel.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted" });
    } catch (err) { res.status(500).json(err); }
});

// --- API XÓA 1 FILE CỤ THỂ TRONG DANH SÁCH ---
app.post('/api/trucking/:id/delete-file', async (req, res) => {
    try {
        const { filePath } = req.body; // Client gửi đường dẫn file cần xóa
        const item = await TruckingModel.findById(req.params.id);
        
        if (item) {
            // 1. Xóa file vật lý
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            // 2. Xóa khỏi mảng trong DB
            item.invoices = item.invoices.filter(f => f.path !== filePath);
            await item.save();
        }
        res.json({ message: "File deleted" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// THAY ĐỔI 3: Listen theo biến PORT
app.listen(PORT, () => { console.log(`🚀 Server running at http://localhost:${PORT}`); });