const { getDb } = require('./database');
const bcrypt = require('bcryptjs');

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

const DEPARTMENTS = ["HR","Finance","IT","Operations","Workshop","Inventory","Canteen","Security","Admin","Maintenance"];
const POSITIONS = ["Manager","Senior Specialist","Specialist","Coordinator","Technician","Assistant","Supervisor","Analyst","Officer","Engineer"];

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

const INV_CATEGORIES = ["Stationery","Electronics","Workshop","Lab","Sports","Safety","Maintenance"];
const SUPPLIER_NAMES = [
  "ElAraby Trading Co.","Sahara Office Supplies","Delta Tech Solutions","Cairo Lab Equipment",
  "Nile Safety Products","Modern Workshop Tools","Egyptian Paper Mills","TechnoMed Supplies",
  "Al-Ahram Stationery","Premier Electronics","SafeGuard Industries","SportZone Egypt",
  "MedEquip Cairo","AutoParts Express","BuildMaster Supplies","ChemLab Partners",
  "DigitalEdge Solutions","National Uniforms Co.","CleanTech Egypt","Future Supplies",
];
const SUP_CATS = ["Stationery","Electronics","Workshop","Lab","Safety","Sports","Maintenance"];

async function seed() {
  const db = getDb();

  // Check if already seeded
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM employees').get();
  if (existing.cnt > 0) {
    console.log('Database already seeded. Skipping...');
    return;
  }

  console.log('Seeding database...');

  // ─── USERS ───────────────────────────────────────────────
  const hashedPass = bcrypt.hashSync('admin123', 10);
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, email_verified) VALUES (?, ?, ?, ?, ?, 1, 1)
  `);

  [
    ["USR-001","System Admin",       "admin@school.edu.eg",    "Admin"],
    ["USR-002","HR Manager",         "hr@school.edu.eg",       "HR"],
    ["USR-003","Head Accountant",    "finance@school.edu.eg",  "Accountant"],
    ["USR-004","Workshop Engineer",  "workshop@school.edu.eg", "WorkshopEngineer"],
    ["USR-005","Store Keeper",       "store@school.edu.eg",    "StoreKeeper"],
    ["USR-006","Canteen Manager",    "canteen@school.edu.eg",  "CanteenManager"],
    ["USR-007","Ahmed Hassan",       "ahmed@school.edu.eg",    "Employee"],
  ].forEach(([id,name,email,role]) => insertUser.run(id,name,email,hashedPass,role));

  // ─── EMPLOYEES ───────────────────────────────────────────
  const insertEmp = db.prepare(`
    INSERT INTO employees (employee_id,name,department,position,salary,status,join_date,phone,email,attendance,avatar)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertMany = db.transaction((items) => { items.forEach(i => insertEmp.run(...i)); });
  const empRows = NAMES.map((name, i) => [
    `EMP-${String(i+1001).padStart(4,'0')}`,
    name,
    DEPARTMENTS[i % 10],
    POSITIONS[i % 10],
    8000 + ((i * 317 + 5432) % 22000),
    i % 7 === 0 ? 'On Leave' : 'Active',
    `202${Math.floor(i/18)}-${String((i%12)+1).padStart(2,'0')}-${String((i%28)+1).padStart(2,'0')}`,
    `+20 10${String((i*7919+12345678)%100000000).padStart(8,'0')}`,
    `employee${i+1}@school.edu.eg`,
    70 + ((i*13+7) % 30),
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${i+1}`,
  ]);
  insertMany(empRows);

  // ─── ATTENDANCE ──────────────────────────────────────────
  const insertAtt = db.prepare(`
    INSERT OR IGNORE INTO attendance (employee_id,employee_name,department,date,check_in,check_out,status)
    VALUES (?,?,?,?,?,?,?)
  `);
  const empList = db.prepare('SELECT * FROM employees LIMIT 20').all();
  const insertAttMany = db.transaction(() => {
    for (let day = 0; day < 30; day++) {
      empList.forEach(emp => {
        const isWeekend = day % 7 >= 5;
        const status = isWeekend ? 'Weekend' : emp.id % 11 === 0 ? 'Absent' : emp.id % 9 === 0 ? 'Late' : 'Present';
        const checkIn  = !isWeekend ? `0${7+Math.floor(((day*emp.id)%120)/60)}:${String((day*emp.id*7)%60).padStart(2,'0')}` : null;
        const checkOut = !isWeekend ? `1${5+Math.floor(((day*emp.id+30)%120)/60)}:${String((day*emp.id*3)%60).padStart(2,'0')}` : null;
        insertAtt.run(
          emp.employee_id, emp.name, emp.department,
          `2025-01-${String(day+1).padStart(2,'0')}`,
          checkIn, checkOut, status
        );
      });
    }
  });
  insertAttMany();

  // ─── PAYROLL ─────────────────────────────────────────────
  const insertPay = db.prepare(`
    INSERT INTO payroll (employee_id,employee_name,department,base_salary,overtime,bonus,penalties,tax_deduction,insurance_deduction,net_salary,month,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertPayMany = db.transaction(() => {
    empList.forEach((emp, idx) => {
      const overtime = (idx*197+300)%2000;
      const bonus    = (idx*317+500)%3000;
      const penalties= (idx*47)%500;
      const tax      = Math.floor(emp.salary*0.1);
      const ins      = Math.floor(emp.salary*0.11);
      const net      = emp.salary + overtime + bonus - penalties - tax - ins;
      insertPay.run(
        emp.employee_id, emp.name, emp.department,
        emp.salary, overtime, bonus, penalties, tax, ins, net,
        'January 2025', idx%3===0 ? 'Pending' : 'Paid'
      );
    });
  });
  insertPayMany();

  // ─── INVENTORY ───────────────────────────────────────────
  const insertInv = db.prepare(`
    INSERT INTO inventory (sku,name,category,quantity,min_stock,unit,unit_price,supplier,location,last_updated)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);
  const insertInvMany = db.transaction(() => {
    for (let i = 0; i < 200; i++) {
      insertInv.run(
        `SKU-${String(i+10001).padStart(5,'0')}`,
        ITEM_NAMES[i%50],
        INV_CATEGORIES[i%7],
        (i*37+11)%200,
        10+((i*7)%20),
        ["pcs","reams","boxes","sets","liters","kg"][i%6],
        5+((i*97)%995),
        `Supplier ${(i%20)+1}`,
        `Warehouse-${String.fromCharCode(65+(i%5))}, Shelf-${(i%10)+1}`,
        `2025-${String((i%12)+1).padStart(2,'0')}-${String((i%28)+1).padStart(2,'0')}`,
      );
    }
  });
  insertInvMany();

  // ─── SUPPLIERS ───────────────────────────────────────────
  const insertSup = db.prepare(`
    INSERT INTO suppliers (name,contact,email,category,total_orders,total_value,status,rating,last_order)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);
  const insertSupMany = db.transaction(() => {
    SUPPLIER_NAMES.forEach((name, i) => {
      insertSup.run(
        name,
        `+20 2 ${2000+i*111}-${3000+i*77}`,
        `contact@supplier${i+1}.com`,
        SUP_CATS[i%7],
        5+((i*7+3)%95),
        50000+((i*47000+13000)%950000),
        i%5===0 ? 'Inactive' : 'Active',
        parseFloat((3+((i*3+1)%20)/10).toFixed(1)),
        `2025-${String((i%12)+1).padStart(2,'0')}-${String((i%28)+1).padStart(2,'0')}`,
      );
    });
  });
  insertSupMany();

  // ─── CANTEEN ─────────────────────────────────────────────
  const insertCan = db.prepare(`
    INSERT INTO canteen_products (name,price,stock,category,sales) VALUES (?,?,?,?,?)
  `);
  [
    ["Foul Sandwich",8,150,"Hot Food",1200],
    ["Ta'meya Sandwich",6,200,"Hot Food",1800],
    ["Egg Sandwich",10,80,"Hot Food",900],
    ["Cheese Sandwich",7,120,"Cold Food",1100],
    ["Water Bottle 500ml",5,500,"Drinks",3200],
    ["Juice Box",8,300,"Drinks",2100],
    ["Pepsi Can",10,8,"Drinks",800],
    ["Chips Bag",5,400,"Snacks",2500],
    ["Chocolate Bar",12,250,"Snacks",1600],
    ["Yogurt Cup",9,5,"Dairy",700],
    ["Croissant",15,60,"Bakery",500],
    ["Cake Slice",20,40,"Bakery",300],
  ].forEach(p => insertCan.run(...p));

  // ─── EQUIPMENT ───────────────────────────────────────────
  const insertEq = db.prepare(`
    INSERT INTO equipment (name,model,status,department,last_maintenance,next_maintenance,condition)
    VALUES (?,?,?,?,?,?,?)
  `);
  [
    ["CNC Milling Machine","Haas VF-2","Active","Mechanical Workshop","2024-12-01","2025-03-01","Good"],
    ["Lathe Machine","Colchester Student 1800","Active","Mechanical Workshop","2024-11-15","2025-02-15","Good"],
    ["MIG Welder","Lincoln Electric 210 MP","Under Maintenance","Welding Shop","2025-01-10","2025-04-10","Fair"],
    ["Drill Press","JET JDP-17MF","Active","Mechanical Workshop","2024-10-20","2025-01-20","Good"],
    ["Hydraulic Press","Dake 75H","Out of Service","Mechanical Workshop","2024-08-05","2025-02-05","Poor"],
    ["Surface Grinder","Chevalier FSG-618M","Active","Precision Shop","2024-12-15","2025-03-15","Excellent"],
    ["Oscilloscope","Tektronix TBS1052B","Active","Electronics Lab","2024-11-01","2025-05-01","Good"],
    ["3D Printer","Ultimaker S5","Active","Design Lab","2025-01-05","2025-07-05","Excellent"],
  ].forEach(e => insertEq.run(...e));

  // ─── ASSETS ──────────────────────────────────────────────
  const insertAss = db.prepare(`
    INSERT INTO assets (asset_id,name,assigned_to,employee_id,assign_date,return_date,status,condition)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  [
    ["ASSET-001","Dell Laptop 15\"","Ahmed Hassan","EMP-1001","2024-03-15",null,"In Use","Good"],
    ["ASSET-002","iPhone 13 Pro","Sara Mohamed","EMP-1002","2024-05-01",null,"In Use","Excellent"],
    ["ASSET-003","Canon EOS Camera","Omar Khalil","EMP-1003","2024-01-10","2024-12-31","Returned","Good"],
    ["ASSET-004","Projector Epson","Nour El-Din","EMP-1004","2023-09-01",null,"In Use","Fair"],
    ["ASSET-005","Office Chair Ergonomic","Mona Fathy","EMP-1005","2024-02-20",null,"In Use","Good"],
    ["ASSET-006","Power Tools Set","Karim Adel","EMP-1006","2024-07-15","2025-01-01","Returned","Fair"],
    ["ASSET-007","Scientific Calculator","Dina Samir","EMP-1007","2024-04-10",null,"In Use","Good"],
    ["ASSET-008","Wireless Headset","Youssef Ali","EMP-1008","2024-08-20",null,"In Use","Excellent"],
  ].forEach(a => insertAss.run(...a));

  // ─── LEAVES ──────────────────────────────────────────────
  const insertLeave = db.prepare(`
    INSERT INTO leaves (employee,type,from_date,to_date,days,status) VALUES (?,?,?,?,?,?)
  `);
  [
    ["Sara Mohamed","Annual Leave","2025-02-01","2025-02-07",7,"Approved"],
    ["Mona Fathy","Sick Leave","2025-01-28","2025-01-30",3,"Pending"],
    ["Omar Khalil","Emergency Leave","2025-01-25","2025-01-25",1,"Approved"],
    ["Dina Samir","Unpaid Leave","2025-02-10","2025-02-20",11,"Pending"],
    ["Karim Adel","Annual Leave","2025-03-01","2025-03-10",10,"Rejected"],
  ].forEach(l => insertLeave.run(...l));

  // ─── PENALTIES ───────────────────────────────────────────
  const insertPen = db.prepare(`
    INSERT INTO penalties (employee,reason,amount,date,status) VALUES (?,?,?,?,?)
  `);
  [
    ["Ahmed Hassan","Late arrival (3 times)",250,"2025-01-15","Applied"],
    ["Tarek Mahmoud","Unauthorized absence",500,"2025-01-20","Applied"],
    ["Wael Aziz","Dress code violation",150,"2025-01-22","Pending"],
    ["Hassan Osman","Late submission of reports",200,"2025-01-25","Applied"],
  ].forEach(p => insertPen.run(...p));

  console.log('✅ Database seeded successfully!');
}

seed().catch(console.error);
