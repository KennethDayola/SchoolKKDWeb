const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcrypt");

const app = express();
const saltRounds = 10;
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Initialize the database
const db = new sqlite3.Database("./school.db", sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => { 
  if (err) {
    console.error("Error opening database", err);
  } else {
    console.log("Database opened successfully");

    // Create Users Table
    db.run(
      `CREATE TABLE IF NOT EXISTS Users (
        username TEXT PRIMARY KEY,
        password TEXT,
        firstname TEXT,
        middlename TEXT,
        lastname TEXT,
        student_id INTEGER UNIQUE,
        course TEXT,
        year_level TEXT,
        classification TEXT,
        college TEXT,
        email TEXT UNIQUE,
        mobile TEXT,
        birthdate TEXT,
        gender TEXT
      );`,
      (err) => {
        if (err) {
          console.error("Error creating Users table", err);
        } else {
          console.log("Users table is ready.");
        }
      }
    );

    // Create Subjects table - consolidated schema with all fields
    db.run(
      `CREATE TABLE IF NOT EXISTS Subjects (
        subject_code TEXT PRIMARY KEY,
        subject_name TEXT NOT NULL,
        description TEXT,
        units INTEGER NOT NULL DEFAULT 0,
        course_code TEXT,
        year_level INTEGER,
        semester INTEGER
      );`,
      (err) => {
        if (err) {
          console.error("Error creating Subjects table", err);
        } else {
          console.log("Subjects table is ready.");
        }
      }
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS SubjectSchedule (
        edp_code TEXT PRIMARY KEY,
        subject_code TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        days TEXT NOT NULL,
        room TEXT,
        units INTEGER NOT NULL,
        actions TEXT,
        FOREIGN KEY (subject_code) REFERENCES Subjects(subject_code) ON DELETE CASCADE
      );`,
      (err) => {
        if (err) {
          console.error("Error creating SubjectSchedule table", err);
        } else {
          console.log("SubjectSchedule table is ready.");
        }
      }
    );

    // Create EnrollmentHeader table to track enrollment status
    db.run(
      `CREATE TABLE IF NOT EXISTS EnrollmentHeader (
        enrollment_id INTEGER PRIMARY KEY AUTOINCREMENT,
        stud_id INTEGER NOT NULL,
        enrollment_date TEXT NOT NULL,
        academic_year TEXT NOT NULL,
        semester INTEGER NOT NULL,
        step INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'PENDING',
        total_units INTEGER DEFAULT 0,
        total_amount REAL DEFAULT 0,
        FOREIGN KEY (stud_id) REFERENCES Users(student_id) ON DELETE CASCADE,
        UNIQUE(stud_id, academic_year, semester)
      );`,
      (err) => {
        if (err) {
          console.error("Error creating EnrollmentHeader table", err);
        } else {
          console.log("EnrollmentHeader table is ready.");
        }
      }
    );

    // Create EnrollmentDetail table to store enrolled subjects
    db.run(
      `CREATE TABLE IF NOT EXISTS EnrollmentDetail (
        detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
        enrollment_id INTEGER NOT NULL,
        subject_code TEXT NOT NULL,
        edp_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        FOREIGN KEY (enrollment_id) REFERENCES EnrollmentHeader(enrollment_id) ON DELETE CASCADE,
        FOREIGN KEY (subject_code) REFERENCES Subjects(subject_code) ON DELETE CASCADE,
        FOREIGN KEY (edp_code) REFERENCES SubjectSchedule(edp_code) ON DELETE CASCADE,
        UNIQUE(enrollment_id, subject_code)
      );`,
      (err) => {
        if (err) {
          console.error("Error creating EnrollmentDetail table", err);
        } else {
          console.log("EnrollmentDetail table is ready.");
        }
      }
    );

    // Create Courses table
    db.run(`CREATE TABLE IF NOT EXISTS Courses (
      course_code TEXT PRIMARY KEY,
      course_name TEXT NOT NULL,
      description TEXT
    )`, (err) => {
      if (err) {
        console.error("Error creating Courses table", err);
      } else {
        console.log("Courses table is ready.");
      }
    });

    // Insert sample data for Computer Science course
    db.run(`INSERT OR IGNORE INTO Courses (course_code, course_name, description) 
      VALUES ('CS', 'Computer Science', 'Bachelor of Science in Computer Science')`);

    // Insert sample subjects
    const subjects = [
      ['CS101', 'Introduction to Computer Science', 'Basic concepts of computer science', 3, 'CS', 1, 1],
      ['ENG101', 'English Communication', 'Basic English communication skills', 3, 'CS', 1, 1],
      ['HIST101', 'Philippine History', 'History of the Philippines', 3, 'CS', 1, 1]
    ];

    const stmt = db.prepare(`INSERT OR IGNORE INTO Subjects 
      (subject_code, subject_name, description, units, course_code, year_level, semester) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`);

    subjects.forEach(subject => {
      stmt.run(subject);
    });
    stmt.finalize();
  }
});

app.get("/study-load/:studentId", (req, res) => {
  const studentId = req.params.studentId;

  const query = `
    SELECT ed.edp_code, s.subject_code, s.subject_name, ss.start_time, ss.end_time, ss.days, ss.room, ss.units 
    FROM EnrollmentHeader eh
    JOIN EnrollmentDetail ed ON eh.enrollment_id = ed.enrollment_id
    JOIN SubjectSchedule ss ON ed.edp_code = ss.edp_code
    JOIN Subjects s ON ss.subject_code = s.subject_code
    WHERE eh.stud_id = ? AND eh.status != 'CANCELLED';
  `;

  db.all(query, [studentId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: "Database error", details: err.message });
    } else {
      res.json({ studentId, studyLoad: rows });
    }
  });
});

// Admin signup (dummy credentials check)
app.post("/admin-signup", (req, res) => {
  const { username, password, email } = req.body;

  const defaultEmail = "email";
  const defaultUsername = "username";
  const defaultPassword = "password";

  if (
    username === defaultUsername &&
    password === defaultPassword &&
    email === defaultEmail
  ) {
    return res.status(200).json({ message: "Successful sign-up" });
  } else {
    return res.status(401).json({ message: "Unauthorized credentials" });
  }
});

app.post("/add-user", async (req, res) => {
  const {
    username,
    password,
    firstname,
    middlename,
    lastname,
    student_id,
    course,
    year_level,
    classification,
    college,
    email,
    mobile,
    birthdate,
    gender,
  } = req.body;

  // Check if all fields are provided
  if (
    !username ||
    !password ||
    !firstname ||
    !lastname ||
    !student_id ||
    !course ||
    !year_level ||
    !classification ||
    !college ||
    !email ||
    !mobile ||
    !birthdate ||
    !gender
  ) {
    return res.status(400).json({ error: "All required fields must be provided" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const studentIdInt = parseInt(student_id, 10);

    db.run(
      `INSERT INTO Users (
        username, password, firstname, middlename, lastname, student_id, course, year_level, classification, college, email, mobile, birthdate, gender
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        username,
        hashedPassword, 
        firstname,
        middlename || "",
        lastname,
        studentIdInt,
        course,
        year_level,
        classification,
        college,
        email,
        mobile,
        birthdate,
        gender,
      ],
      (err) => {
        if (err) {
          return res
            .status(500)
            .json({ error: "Error adding user", details: err.message });
        }
        res.json({ message: "User added successfully" });
      }
    );
  } catch (error) {
    res.status(500).json({ error: "Error hashing password", details: error.message });
  }
});

// Get all users
app.get("/users", (req, res) => {
  db.all("SELECT * FROM Users", [], (err, rows) => {
    if (err) {
      res.status(500).send("Error retrieving users");
    } else {
      res.json(rows);
    }
  });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  try {
    db.get(
      "SELECT username, password FROM Users WHERE username = ?",
      [username],
      async (err, row) => {
        if (err) {
          return res.status(500).json({ message: "Database error", details: err.message });
        }

        if (!row) {
          return res.status(403).json({ message: "User not found" });
        }

        // Compare the plain-text password with the hashed password
        try {
          const passwordMatch = await bcrypt.compare(password, row.password);

          if (!passwordMatch) {
            return res.status(403).json({ message: "Invalid username or password" });
          }

          res.status(200).json({ message: "Login successful" });
        } catch (bcryptError) {
          return res.status(500).json({ message: "Password verification error", details: bcryptError.message });
        }
      }
    );
  } catch (error) {
    res.status(500).json({ message: "Server error", details: error.message });
  }
});

app.get("/userinfo", (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  db.get(
    "SELECT * FROM Users WHERE username = ?",
    [username],
    (err, row) => {
      if (err) {
        return res
          .status(500)
          .json({ error: "Database error", details: err.message });
      }

      if (!row) {
        return res.status(404).json({ error: "User not found" });
      }

      // Remove password from response for security
      const { password, ...userInfo } = row;
      res.json(userInfo);
    }
  );
});

// Delete a user
app.delete("/delete-user/:username", (req, res) => {
  const { username } = req.params;

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  db.run("DELETE FROM Users WHERE username = ?", [username], function (err) {
    if (err) {
      return res
        .status(500)
        .json({ error: "Error deleting user", details: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ message: `User '${username}' deleted successfully` });
  });
});

// Updated enrollment endpoint to use header-detail structure
app.post("/enroll", (req, res) => {
  const { enrollments } = req.body;

  if (!enrollments || enrollments.length === 0) {
    return res.status(400).json({ message: "No enrollment data provided" });
  }

  // Get student ID from the first enrollment (assuming all have the same student ID)
  const studentId = enrollments[0].stud_id;
  const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const academicYear = "2024-2025"; // This could be dynamic
  const semester = 1; // This could be dynamic

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // Create or get enrollment header
    const checkHeaderSql = `
      SELECT enrollment_id FROM EnrollmentHeader 
      WHERE stud_id = ? AND academic_year = ? AND semester = ?
    `;
    
    const insertHeaderSql = `
      INSERT INTO EnrollmentHeader (stud_id, enrollment_date, academic_year, semester, step, status)
      VALUES (?, ?, ?, ?, 3, 'PENDING')
    `;
    
    const updateHeaderSql = `
      UPDATE EnrollmentHeader 
      SET step = 3, status = 'PENDING', enrollment_date = ?
      WHERE enrollment_id = ?
    `;

    db.get(checkHeaderSql, [studentId, academicYear, semester], (err, headerRow) => {
      if (err) {
        db.run("ROLLBACK");
        return res.status(500).json({ message: "Database error", details: err.message });
      }

      let enrollmentId;
      let headerPromise;

      if (headerRow) {
        // Update existing header
        enrollmentId = headerRow.enrollment_id;
        headerPromise = new Promise((resolve, reject) => {
          db.run(updateHeaderSql, [currentDate, enrollmentId], function(err) {
            if (err) return reject(err);
            resolve(enrollmentId);
          });
        });
      } else {
        // Create new header
        headerPromise = new Promise((resolve, reject) => {
          db.run(insertHeaderSql, [studentId, currentDate, academicYear, semester], function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
          });
        });
      }

      headerPromise
        .then(headerID => {
          // Clear any existing detail records
          const deleteDetailSql = `DELETE FROM EnrollmentDetail WHERE enrollment_id = ?`;
          return new Promise((resolve, reject) => {
            db.run(deleteDetailSql, [headerID], (err) => {
              if (err) return reject(err);
              resolve(headerID);
            });
          });
        })
        .then(headerID => {
          // Insert new detail records
          const insertDetailSql = `
            INSERT INTO EnrollmentDetail (enrollment_id, subject_code, edp_code, status)
            VALUES (?, ?, ?, 'PENDING')
          `;
          
          const detailPromises = enrollments.map(enrollment => {
            return new Promise((resolve, reject) => {
              db.run(insertDetailSql, [headerID, enrollment.subject_code, enrollment.edp_code], function(err) {
                if (err) return reject(err);
                resolve();
              });
            });
          });
          
          return Promise.all(detailPromises).then(() => headerID);
        })
        .then(headerID => {
          // Calculate and update total units
          const updateTotalSql = `
            UPDATE EnrollmentHeader 
            SET total_units = (
              SELECT SUM(ss.units) 
              FROM EnrollmentDetail ed
              JOIN SubjectSchedule ss ON ed.edp_code = ss.edp_code
              WHERE ed.enrollment_id = ?
            ),
            total_amount = (
              SELECT SUM(ss.units) * 1500
              FROM EnrollmentDetail ed
              JOIN SubjectSchedule ss ON ed.edp_code = ss.edp_code
              WHERE ed.enrollment_id = ?
            )
            WHERE enrollment_id = ?
          `;
          
          return new Promise((resolve, reject) => {
            db.run(updateTotalSql, [headerID, headerID, headerID], function(err) {
              if (err) return reject(err);
              resolve(headerID);
            });
          });
        })
        .then(headerID => {
          db.run("COMMIT", err => {
            if (err) {
              db.run("ROLLBACK");
              return res.status(500).json({ message: "Failed to commit transaction" });
            }
            res.json({ 
              message: "Enrollment submitted successfully", 
              enrollment_id: headerID,
              step: 3,
              status: "PENDING"
            });
          });
        })
        .catch(error => {
          db.run("ROLLBACK");
          res.status(500).json({ message: "Enrollment failed", details: error });
        });
    });
  });
});

// Get enrollment status
app.get("/enrollment-status/:studentId", (req, res) => {
  const studentId = req.params.studentId;
  const academicYear = req.query.academicYear || "2024-2025";
  const semester = parseInt(req.query.semester) || 1;

  const query = `
    SELECT * FROM EnrollmentHeader
    WHERE stud_id = ? AND academic_year = ? AND semester = ?
  `;

  db.get(query, [studentId, academicYear, semester], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error", details: err.message });
    }
    
    if (!row) {
      return res.json({ 
        exists: false,
        step: 1, 
        status: "NOT_STARTED",
        message: "Enrollment not started yet" 
      });
    }
    
    res.json({
      exists: true,
      enrollment_id: row.enrollment_id,
      step: row.step,
      status: row.status,
      date: row.enrollment_date,
      total_units: row.total_units,
      total_amount: row.total_amount
    });
  });
});

// Update enrollment step
app.post("/update-enrollment-step", (req, res) => {
  const { enrollmentId, step, status } = req.body;
  
  if (!enrollmentId || !step || !status) {
    return res.status(400).json({ error: "Enrollment ID, step and status are required" });
  }
  
  db.run(
    "UPDATE EnrollmentHeader SET step = ?, status = ? WHERE enrollment_id = ?",
    [step, status, enrollmentId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: "Update failed", details: err.message });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: "Enrollment record not found" });
      }
      
      res.json({ message: "Enrollment step updated successfully" });
    }
  );
});

// Get enrollment details
app.get("/enrollment-details/:enrollmentId", (req, res) => {
  const enrollmentId = req.params.enrollmentId;

  const query = `
    SELECT 
      ed.detail_id,
      ed.subject_code,
      s.subject_name,
      ed.edp_code,
      ss.start_time,
      ss.end_time,
      ss.days,
      ss.room,
      ss.units,
      ed.status
    FROM EnrollmentDetail ed
    JOIN SubjectSchedule ss ON ed.edp_code = ss.edp_code
    JOIN Subjects s ON ed.subject_code = s.subject_code
    WHERE ed.enrollment_id = ?
  `;

  db.all(query, [enrollmentId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: "Database error", details: err.message });
    }
    
    res.json({
      enrollment_id: enrollmentId,
      details: rows
    });
  });
});

app.get("/schedule/:edpCode", (req, res) => {
  const edpCode = req.params.edpCode;

  db.get(
    `SELECT * FROM SubjectSchedule WHERE edp_code = ?`,
    [edpCode],
    (err, row) => {
      if (err) {
        res.status(500).send("Database error: " + err.message);
      } else if (row) {
        res.json(row);
      } else {
        res.status(404).send("No record found with EDP code: " + edpCode);
      }
    }
  );
});

app.get("/api/subjects-for-semester", (req, res) => {
  const { course, year, semester } = req.query;
  
  // Validate input parameters
  if (!course || !year || !semester) {
    return res.status(400).json({ error: "Course, year, and semester are required parameters" });
  }
  
  const yearLevel = parseInt(year);
  const semesterNum = parseInt(semester);
  
  const query = `
    SELECT 
      s.subject_code,
      s.subject_name,
      s.description,
      s.units,
      ss.edp_code,
      ss.start_time,
      ss.end_time,
      ss.days,
      ss.room
    FROM Subjects s
    LEFT JOIN SubjectSchedule ss ON s.subject_code = ss.subject_code
    WHERE s.course_code = ? AND s.year_level = ? AND s.semester = ?
    ORDER BY s.subject_code;
  `;

  db.all(query, [course, yearLevel, semesterNum], (err, rows) => {
    if (err) {
      console.error("Error fetching semester subjects", err);
      res.status(500).json({ error: "Database error" });
    } else {
      const groupedSubjects = {};

      rows.forEach(row => {
        if (!groupedSubjects[row.subject_code]) {
          groupedSubjects[row.subject_code] = {
            subject_code: row.subject_code,
            subject_name: row.subject_name,
            description: row.description,
            units: row.units,
            schedules: []
          };
        }

        if (row.edp_code) {
          groupedSubjects[row.subject_code].schedules.push({
            edp_code: row.edp_code,
            start_time: row.start_time,
            end_time: row.end_time,
            days: row.days,
            room: row.room,
            units: row.units
          });
        }
      });

      res.json(Object.values(groupedSubjects));
    }
  });
});

app.post("/update-user", async (req, res) => {
  const { username, currentPassword, newPassword, confirmPassword, newEmail } = req.body;

  if (!username || !currentPassword || !newPassword || !confirmPassword || !newEmail) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New password and confirmation do not match" });
  }

  try {
    db.get("SELECT password FROM Users WHERE username = ?", [username], async (err, row) => {
      if (err) return res.status(500).json({ error: "Database error", details: err.message });
      if (!row) return res.status(404).json({ error: "User not found" });

      try {
        const isMatch = await bcrypt.compare(currentPassword, row.password);
        if (!isMatch) {
          return res.status(403).json({ error: "Current password is incorrect" });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        db.run(
          "UPDATE Users SET email = ?, password = ? WHERE username = ?",
          [newEmail, hashedNewPassword, username],
          function (err) {
            if (err) {
              return res.status(500).json({ error: "Update failed", details: err.message });
            }
            res.json({ message: "Email and password updated successfully" });
          }
        );
      } catch (bcryptError) {
        return res.status(500).json({ error: "Password verification error", details: bcryptError.message });
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

app.get("/tuition/:studentId", (req, res) => {
  const studentId = req.params.studentId;
  const academicYear = req.query.academicYear || "2024-2025";
  const semester = parseInt(req.query.semester) || 1;

  const query = `
    SELECT total_units, total_amount
    FROM EnrollmentHeader
    WHERE stud_id = ? AND academic_year = ? AND semester = ?;
  `;

  db.get(query, [studentId, academicYear, semester], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error", details: err.message });
    }

    if (!row) {
      return res.json({
        studentId: studentId,
        totalUnits: 0,
        tuitionFee: 0
      });
    }

    res.json({
      studentId: studentId,
      totalUnits: row.total_units || 0,
      tuitionFee: row.total_amount || 0
    });
  });
});

app.get("/assessment/:studentId", (req, res) => {
  const studentId = req.params.studentId;
  const academicYear = req.query.academicYear || "2024-2025";
  const semester = parseInt(req.query.semester) || 1;

  // First, find the enrollment header
  const headerQuery = `
    SELECT enrollment_id, total_units, total_amount
    FROM EnrollmentHeader
    WHERE stud_id = ? AND academic_year = ? AND semester = ?;
  `;

  db.get(headerQuery, [studentId, academicYear, semester], (err, headerRow) => {
    if (err) {
      return res.status(500).json({ error: "Database error", details: err.message });
    }

    if (!headerRow) {
      return res.json({
        studentId: studentId,
        subjects: [],
        totalUnits: 0,
        tuitionFee: 0
      });
    }

    // Then get the enrollment details
    const detailsQuery = `
      SELECT 
        s.subject_name,
        ed.edp_code,
        ss.start_time,
        ss.end_time,
        ss.days,
        ss.room,
        ss.units
      FROM EnrollmentDetail ed
      JOIN SubjectSchedule ss ON ed.edp_code = ss.edp_code
      JOIN Subjects s ON ed.subject_code = s.subject_code
      WHERE ed.enrollment_id = ?;
    `;

    db.all(detailsQuery, [headerRow.enrollment_id], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: "Database error", details: err.message });
      }

      res.json({
        studentId: studentId,
        subjects: rows,
        totalUnits: headerRow.total_units || 0,
        tuitionFee: headerRow.total_amount || 0
      });
    });
  });
});

app.get('/api/prospectus', (req, res) => {
  const query = `
    SELECT 
      subject_code, 
      subject_name, 
      description, 
      units, 
      year_level, 
      semester
    FROM Subjects
    WHERE course_code = 'CS'
    ORDER BY year_level, semester, subject_code
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    // Group subjects by year level and semester
    const prospectus = rows.reduce((acc, row) => {
      const key = `Year ${row.year_level} - Semester ${row.semester}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(row);
      return acc;
    }, {});

    res.json(prospectus);
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`App is running on port ${PORT}`);
});