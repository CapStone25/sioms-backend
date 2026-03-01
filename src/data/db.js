// ============================================================
// SIOMS - Mock Database (In-Memory)
// In production, replace with a real DB (PostgreSQL, MongoDB, etc.)
// ============================================================

const DEPARTMENTS = ["HR","Finance","IT","Operations","Workshop","Inventory","Canteen","Security","Admin","Maintenance"];
const POSITIONS = ["Manager","Senior Specialist","Specialist","Coordinator","Technician","Assistant","Supervisor","Analyst","Officer","Engineer"];

const NAMES = [
  "Ahmed Hassan","Sara Mohamed","Omar Khalil","Nour El-Din","Mona Fathy",
  "Karim Adel","Dina Samir","Youssef Ali","Hana Ibrahim","Tarek Mahmoud",
  "Rania Gamal","Sherif Nasser","Amira Taha","Bassem Farouk","Laila Hosny",
  "Mostafa Sayed","Nadia Fouad","Khaled Ragab","Eman Khairy","Wael Aziz",
  "Mariam Soliman","Hassan Osman","Fatma Abdel","Amir Mansour","Dalia Reda",
  "Ibrahim Lotfy","Suha Wagdi","Mahmoud Fikry","Reem Salah","Sameh Atef",
  "Noha Shafiq","Adel Hamdy","Yasmine Zaki","Hesham Maher","Lobna Fouad",
  "Tarek Wagih","Sherine Abbas","Osama Helmy","Inas Morsy","Alaa Barakat",
  "Ghada Nassar","Amr Rizk","Heba Nour","Samir Halim","Doaa Salem",
  "Fady Gerges","Rasha Habib","Essam Badawi","Niveen Gad","Hazem Monir",
  "Aida Wahba","Nasser Yehia",
];

// ============================================================
// EMPLOYEES
// ============================================================
let employees = Array.from({ length: 52 }, (_, i) => ({
  id: i + 1,
  employeeId: `EMP-${String(i + 1001).padStart(4, "0")}`,
  name: NAMES[i],
  department: DEPARTMENTS[i % 10],
  position: POSITIONS[i % 10],
  salary: 8000 + ((i * 317 + 5432) % 22000),
  status: i % 7 === 0 ? "On Leave" : "Active",
  joinDate: `202${Math.floor(i / 18)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
  phone: `+20 10${String((i * 7919 + 12345678) % 100000000).padStart(8, "0")}`,
  email: `employee${i + 1}@school.edu.eg`,
  attendance: 70 + ((i * 13 + 7) % 30),
  avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i + 1}`,
}));

// ============================================================
// INVENTORY
// ============================================================
const ITEM_NAMES = [
  "Whiteboard Markers","A4 Paper Ream","Ballpoint Pens","Notebooks","Staplers",
  "Scissors","Ruler 30cm","Correction Fluid","Highlighters","File Folders",
  "Printer Ink Cartridge","Toner Cartridge","USB Flash Drive","HDMI Cable","Power Strip",
  "Safety Gloves","Lab Coat","Face Shield","Fire Extinguisher","First Aid Kit",
  "Drill Machine","Angle Grinder","Welding Rod","Safety Helmet","Work Boots",
  "Engine Oil","Hydraulic Fluid","Brake Pads","Spark Plugs","Air Filter",
  "Laptop 15\"","Desktop PC","Monitor 24\"","Keyboard","Mouse",
  "Network Switch","WiFi Router","Server Rack","UPS Battery","Network Cable",
  "Chemistry Flask","Bunsen Burner","Measuring Cylinder","Petri Dish","Microscope",
  "Basketball","Football","Volleyball","Tennis Racket","Ping Pong Table",
];

let inventory = Array.from({ length: 200 }, (_, i) => ({
  id: i + 1,
  sku: `SKU-${String(i + 10001).padStart(5, "0")}`,
  name: ITEM_NAMES[i % 50],
  category: ["Stationery","Electronics","Workshop","Lab","Sports","Safety","Maintenance"][i % 7],
  quantity: (i * 37 + 11) % 200,
  minStock: 10 + ((i * 7) % 20),
  unit: ["pcs","reams","boxes","sets","liters","kg"][i % 6],
  unitPrice: 5 + ((i * 97) % 995),
  supplier: `Supplier ${(i % 20) + 1}`,
  location: `Warehouse-${String.fromCharCode(65 + (i % 5))}, Shelf-${(i % 10) + 1}`,
  lastUpdated: `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
}));

// ============================================================
// SUPPLIERS
// ============================================================
let suppliers = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  name: [
    "ElAraby Trading Co.","Sahara Office Supplies","Delta Tech Solutions","Cairo Lab Equipment",
    "Nile Safety Products","Modern Workshop Tools","Egyptian Paper Mills","TechnoMed Supplies",
    "Al-Ahram Stationery","Premier Electronics","SafeGuard Industries","SportZone Egypt",
    "MedEquip Cairo","AutoParts Express","BuildMaster Supplies","ChemLab Partners",
    "DigitalEdge Solutions","National Uniforms Co.","CleanTech Egypt","Future Supplies",
  ][i],
  contact: `+20 2 ${2000 + i * 111}-${3000 + i * 77}`,
  email: `contact@supplier${i + 1}.com`,
  category: ["Stationery","Electronics","Workshop","Lab","Safety","Sports","Maintenance"][i % 7],
  totalOrders: 5 + ((i * 7 + 3) % 95),
  totalValue: 50000 + ((i * 47000 + 13000) % 950000),
  status: i % 5 === 0 ? "Inactive" : "Active",
  rating: parseFloat((3 + ((i * 3 + 1) % 20) / 10).toFixed(1)),
  lastOrder: `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
}));

// ============================================================
// ATTENDANCE
// ============================================================
let attendance = Array.from({ length: 30 }, (_, day) =>
  employees.slice(0, 20).map((emp) => ({
    id: day * 20 + emp.id,
    employeeId: emp.employeeId,
    employeeName: emp.name,
    department: emp.department,
    date: `2025-01-${String(day + 1).padStart(2, "0")}`,
    checkIn: day % 7 < 5 ? `0${7 + Math.floor(((day * emp.id) % 120) / 60)}:${String((day * emp.id * 7) % 60).padStart(2, "0")}` : null,
    checkOut: day % 7 < 5 ? `1${5 + Math.floor(((day * emp.id + 30) % 120) / 60)}:${String((day * emp.id * 3) % 60).padStart(2, "0")}` : null,
    status: day % 7 >= 5 ? "Weekend" : emp.id % 11 === 0 ? "Absent" : emp.id % 9 === 0 ? "Late" : "Present",
  }))
).flat();

// ============================================================
// PAYROLL
// ============================================================
let payroll = employees.map((emp, idx) => {
  const overtime = (idx * 197 + 300) % 2000;
  const bonus = (idx * 317 + 500) % 3000;
  const penalties = (idx * 47) % 500;
  const taxDeduction = Math.floor(emp.salary * 0.1);
  const insuranceDeduction = Math.floor(emp.salary * 0.11);
  return {
    id: idx + 1,
    employeeId: emp.employeeId,
    employeeName: emp.name,
    department: emp.department,
    baseSalary: emp.salary,
    overtime,
    bonus,
    penalties,
    taxDeduction,
    insuranceDeduction,
    netSalary: emp.salary + overtime + bonus - penalties - taxDeduction - insuranceDeduction,
    month: "January 2025",
    status: idx % 3 === 0 ? "Pending" : "Paid",
  };
});

// ============================================================
// CANTEEN PRODUCTS
// ============================================================
let canteenProducts = [
  { id: 1, name: "Foul Sandwich", price: 8, stock: 150, category: "Hot Food", sales: 1200 },
  { id: 2, name: "Ta'meya Sandwich", price: 6, stock: 200, category: "Hot Food", sales: 1800 },
  { id: 3, name: "Egg Sandwich", price: 10, stock: 80, category: "Hot Food", sales: 900 },
  { id: 4, name: "Cheese Sandwich", price: 7, stock: 120, category: "Cold Food", sales: 1100 },
  { id: 5, name: "Water Bottle 500ml", price: 5, stock: 500, category: "Drinks", sales: 3200 },
  { id: 6, name: "Juice Box", price: 8, stock: 300, category: "Drinks", sales: 2100 },
  { id: 7, name: "Pepsi Can", price: 10, stock: 8, category: "Drinks", sales: 800 },
  { id: 8, name: "Chips Bag", price: 5, stock: 400, category: "Snacks", sales: 2500 },
  { id: 9, name: "Chocolate Bar", price: 12, stock: 250, category: "Snacks", sales: 1600 },
  { id: 10, name: "Yogurt Cup", price: 9, stock: 5, category: "Dairy", sales: 700 },
  { id: 11, name: "Croissant", price: 15, stock: 60, category: "Bakery", sales: 500 },
  { id: 12, name: "Cake Slice", price: 20, stock: 40, category: "Bakery", sales: 300 },
];

let canteenTransactions = [];

// ============================================================
// EQUIPMENT (Workshop)
// ============================================================
let equipment = [
  { id: 1, name: "CNC Milling Machine", model: "Haas VF-2", status: "Active", department: "Mechanical Workshop", lastMaintenance: "2024-12-01", nextMaintenance: "2025-03-01", condition: "Good" },
  { id: 2, name: "Lathe Machine", model: "Colchester Student 1800", status: "Active", department: "Mechanical Workshop", lastMaintenance: "2024-11-15", nextMaintenance: "2025-02-15", condition: "Good" },
  { id: 3, name: "MIG Welder", model: "Lincoln Electric 210 MP", status: "Under Maintenance", department: "Welding Shop", lastMaintenance: "2025-01-10", nextMaintenance: "2025-04-10", condition: "Fair" },
  { id: 4, name: "Drill Press", model: "JET JDP-17MF", status: "Active", department: "Mechanical Workshop", lastMaintenance: "2024-10-20", nextMaintenance: "2025-01-20", condition: "Good" },
  { id: 5, name: "Hydraulic Press", model: "Dake 75H", status: "Out of Service", department: "Mechanical Workshop", lastMaintenance: "2024-08-05", nextMaintenance: "2025-02-05", condition: "Poor" },
  { id: 6, name: "Surface Grinder", model: "Chevalier FSG-618M", status: "Active", department: "Precision Shop", lastMaintenance: "2024-12-15", nextMaintenance: "2025-03-15", condition: "Excellent" },
  { id: 7, name: "Oscilloscope", model: "Tektronix TBS1052B", status: "Active", department: "Electronics Lab", lastMaintenance: "2024-11-01", nextMaintenance: "2025-05-01", condition: "Good" },
  { id: 8, name: "3D Printer", model: "Ultimaker S5", status: "Active", department: "Design Lab", lastMaintenance: "2025-01-05", nextMaintenance: "2025-07-05", condition: "Excellent" },
];

let maintenanceLogs = [];

// ============================================================
// ASSETS
// ============================================================
let assets = [
  { id: 1, assetId: "ASSET-001", name: "Dell Laptop 15\"", assignedTo: "Ahmed Hassan", employeeId: "EMP-1001", assignDate: "2024-03-15", returnDate: null, status: "In Use", condition: "Good" },
  { id: 2, assetId: "ASSET-002", name: "iPhone 13 Pro", assignedTo: "Sara Mohamed", employeeId: "EMP-1002", assignDate: "2024-05-01", returnDate: null, status: "In Use", condition: "Excellent" },
  { id: 3, assetId: "ASSET-003", name: "Canon EOS Camera", assignedTo: "Omar Khalil", employeeId: "EMP-1003", assignDate: "2024-01-10", returnDate: "2024-12-31", status: "Returned", condition: "Good" },
  { id: 4, assetId: "ASSET-004", name: "Projector Epson", assignedTo: "Nour El-Din", employeeId: "EMP-1004", assignDate: "2023-09-01", returnDate: null, status: "In Use", condition: "Fair" },
  { id: 5, assetId: "ASSET-005", name: "Office Chair Ergonomic", assignedTo: "Mona Fathy", employeeId: "EMP-1005", assignDate: "2024-02-20", returnDate: null, status: "In Use", condition: "Good" },
  { id: 6, assetId: "ASSET-006", name: "Power Tools Set", assignedTo: "Karim Adel", employeeId: "EMP-1006", assignDate: "2024-07-15", returnDate: "2025-01-01", status: "Returned", condition: "Fair" },
  { id: 7, assetId: "ASSET-007", name: "Scientific Calculator", assignedTo: "Dina Samir", employeeId: "EMP-1007", assignDate: "2024-04-10", returnDate: null, status: "In Use", condition: "Good" },
  { id: 8, assetId: "ASSET-008", name: "Wireless Headset", assignedTo: "Youssef Ali", employeeId: "EMP-1008", assignDate: "2024-08-20", returnDate: null, status: "In Use", condition: "Excellent" },
];

// ============================================================
// USERS (for auth)
// ============================================================
const ROLE_PERMISSIONS = {
  "Admin": ["dashboard","attendance","hr","payroll","canteen","inventory","suppliers","workshop","assets","settings"],
  "HR Manager": ["dashboard","attendance","hr","payroll","assets"],
  "Accountant": ["dashboard","payroll","canteen","suppliers"],
  "Workshop Manager": ["dashboard","workshop","assets","inventory"],
  "Inventory Manager": ["dashboard","inventory","suppliers"],
  "Teacher": ["dashboard","attendance","workshop"],
  "Engineer": ["dashboard","workshop","assets"],
  "Staff": ["dashboard","attendance"],
};

let users = [
  { id: "USR-001", name: "Admin User", email: "admin@school.edu.eg", password: "admin123", role: "Admin" },
  { id: "USR-002", name: "HR Manager", email: "hr@school.edu.eg", password: "admin123", role: "HR Manager" },
  { id: "USR-003", name: "Accountant", email: "finance@school.edu.eg", password: "admin123", role: "Accountant" },
  { id: "USR-004", name: "Workshop Manager", email: "workshop@school.edu.eg", password: "admin123", role: "Workshop Manager" },
];

// ============================================================
// CHART / DASHBOARD DATA
// ============================================================
const revenueChartData = [
  { month: "Jul", canteen: 42000, inventory: 85000, services: 31000 },
  { month: "Aug", canteen: 38000, inventory: 92000, services: 28000 },
  { month: "Sep", canteen: 51000, inventory: 78000, services: 45000 },
  { month: "Oct", canteen: 47000, inventory: 105000, services: 39000 },
  { month: "Nov", canteen: 55000, inventory: 98000, services: 52000 },
  { month: "Dec", canteen: 61000, inventory: 115000, services: 48000 },
  { month: "Jan", canteen: 58000, inventory: 122000, services: 55000 },
];

const attendanceChartData = [
  { day: "Mon", present: 182, absent: 12, late: 8 },
  { day: "Tue", present: 188, absent: 8, late: 6 },
  { day: "Wed", present: 175, absent: 15, late: 12 },
  { day: "Thu", present: 191, absent: 5, late: 6 },
  { day: "Fri", present: 165, absent: 20, late: 17 },
];

module.exports = {
  employees,
  inventory,
  suppliers,
  attendance,
  payroll,
  canteenProducts,
  canteenTransactions,
  equipment,
  maintenanceLogs,
  assets,
  users,
  ROLE_PERMISSIONS,
  revenueChartData,
  attendanceChartData,
};
