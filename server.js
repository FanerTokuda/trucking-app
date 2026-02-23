const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    file.originalname = Buffer.from(file.originalname, "latin1").toString(
      "utf8",
    );
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });

mongoose
  .connect(
    "mongodb+srv://anhtuanbl123:anhtuanbl123@cluster0.ltknaud.mongodb.net/?appName=Cluster0",
  )
  .then(() => console.log("✅ Đã kết nối MongoDB!"))
  .catch((err) => console.error("❌ Lỗi DB:", err));

const CarrierSchema = new mongoose.Schema({
  name: String,
  taxCode: String,
  key: String,
  createdAt: { type: Date, default: Date.now },
});
const CarrierModel = mongoose.model("Carrier", CarrierSchema);

const TruckingSchema = new mongoose.Schema({
  carrier: String,
  customer: String,
  handler: String,
  booking: String,
  notes: String, // Thêm ghi chú
  containers: [
    {
      vehicle: String,
      contNo: String,
      contType: String,
      operation: String,
      origin: String,
      destination: String,
      cost: Number,
      extraCost: Number,
      liftingCost: Number,
      emptyDepot: String,
    },
  ],
  cost: Number,
  extraCost: { type: Number, default: 0 },
  liftingCost: { type: Number, default: 0 },
  revenue: Number,
  paymentStatus: { type: String, default: "unpaid" },
  liftingInvoice: { path: String, originalName: String },
  invoices: [{ path: String, originalName: String }],
  createdAt: { type: Date, default: Date.now },
});
const TruckingModel = mongoose.model("Trucking", TruckingSchema);

const cpUpload = upload.fields([
  { name: "invoiceFiles", maxCount: 10 },
  { name: "liftingInvoiceFile", maxCount: 1 },
]);

app.get("/api/carriers", async (req, res) => {
  try {
    const data = await CarrierModel.find().sort({ name: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json(err);
  }
});
app.post("/api/carriers", async (req, res) => {
  try {
    if (
      await CarrierModel.findOne({
        name: req.body.name,
        taxCode: req.body.taxCode,
      })
    )
      return res.status(400).json({ error: "Trùng nhà xe!" });
    const newItem = new CarrierModel(req.body);
    await newItem.save();
    res.json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/carriers/:id", async (req, res) => {
  try {
    await CarrierModel.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json(err);
  }
});

app.get("/api/trucking", async (req, res) => {
  try {
    const data = await TruckingModel.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json(err);
  }
});

app.post("/api/trucking", cpUpload, async (req, res) => {
  try {
    const data = req.body;
    data.invoices = [];
    if (data.containersList) data.containers = JSON.parse(data.containersList);
    if (req.files["invoiceFiles"]) {
      req.files["invoiceFiles"].forEach((file) => {
        data.invoices.push({
          path: file.path.replace(/\\/g, "/"),
          originalName: file.originalname,
        });
      });
    }
    if (req.files["liftingInvoiceFile"]) {
      const file = req.files["liftingInvoiceFile"][0];
      data.liftingInvoice = {
        path: file.path.replace(/\\/g, "/"),
        originalName: file.originalname,
      };
    }
    const newItem = new TruckingModel(data);
    await newItem.save();
    res.json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/trucking/:id", cpUpload, async (req, res) => {
  try {
    const item = await TruckingModel.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    const fields = [
      "carrier",
      "customer",
      "handler",
      "booking",
      "paymentStatus",
      "notes",
    ];
    fields.forEach((f) => (item[f] = req.body[f]));
    if (req.body.containersList)
      item.containers = JSON.parse(req.body.containersList);
    item.cost = Number(req.body.cost) || 0;
    item.extraCost = Number(req.body.extraCost) || 0;
    item.liftingCost = Number(req.body.liftingCost) || 0;
    item.revenue = Number(req.body.revenue) || 0;
    if (req.files["invoiceFiles"]) {
      req.files["invoiceFiles"].forEach((file) => {
        item.invoices.push({
          path: file.path.replace(/\\/g, "/"),
          originalName: file.originalname,
        });
      });
    }
    if (req.files["liftingInvoiceFile"]) {
      if (
        item.liftingInvoice &&
        item.liftingInvoice.path &&
        fs.existsSync(item.liftingInvoice.path)
      )
        fs.unlinkSync(item.liftingInvoice.path);
      const file = req.files["liftingInvoiceFile"][0];
      item.liftingInvoice = {
        path: file.path.replace(/\\/g, "/"),
        originalName: file.originalname,
      };
    }
    await item.save();
    res.json({ message: "Updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/trucking/:id", async (req, res) => {
  try {
    const item = await TruckingModel.findById(req.params.id);
    if (item) {
      if (item.invoices)
        item.invoices.forEach((file) => {
          try {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          } catch (e) {}
        });
      if (item.liftingInvoice && item.liftingInvoice.path) {
        try {
          if (fs.existsSync(item.liftingInvoice.path))
            fs.unlinkSync(item.liftingInvoice.path);
        } catch (e) {}
      }
    }
    await TruckingModel.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/trucking/:id/delete-file", async (req, res) => {
  try {
    const { filePath } = req.body;
    const item = await TruckingModel.findById(req.params.id);
    if (item) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      item.invoices = item.invoices.filter((f) => f.path !== filePath);
      if (item.liftingInvoice && item.liftingInvoice.path === filePath)
        item.liftingInvoice = undefined;
      await item.save();
    }
    res.json({ message: "File deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => {
  console.log("🚀 Server running at http://localhost:5000");
});
