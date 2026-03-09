const express = require("express");
const app = express();
const mongoose = require("mongoose");
const Listing = require("./models/listing.js");
const getOpenStatus = require("./public/js/badge.js");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const wrapAsync = require("./utils/wrapAsync.js");
const ExpressError = require("./utils/ExpressError.js");
const { listingSchema } = require("./schema.js");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user");
const Donation = require("./models/donation");
const Hospital = require("./models/hospital");
const UrgentRequest = require("./models/urgentRequest");
const {
  isLoggedIn,
  isDonor,
  isDonee,
  isBloodBankOwner,
  isBloodBankLoggedIn,
  isHospitalLoggedIn,
} = require("./middleware");

main()
  .then(() => {
    console.log("connected to DB");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect("mongodb://127.0.0.1:27017/bloodBank");
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));
app.use(
  session({
    secret: "bloodbanksecret",
    resave: false,
    saveUninitialized: false,
  }),
);
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  res.locals.isUserLoggedIn = req.isAuthenticated();
  res.locals.isBloodBankLoggedIn = Boolean(req.session.bloodbankId);
  res.locals.isHospitalLoggedIn = Boolean(req.session.hospitalId);
  res.locals.currentBloodbankId = req.session.bloodbankId || null;
  res.locals.currentHospitalId = req.session.hospitalId || null;
  next();
});

const logoutCurrentUser = (req) => {
  return new Promise((resolve, reject) => {
    if (!req.isAuthenticated()) return resolve();
    req.logout((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

app.get("/", (req, res) => {
  res.send("root is working");
});

const validateListing = (req, res, next) => {
  let { error } = listingSchema.validate(req.body, { allowUnknown: true });

  if (error) {
    let errMsg = error.details.map((el) => el.message).join(",");
    throw new ExpressError(400, errMsg);
  } else {
    next();
  }
};

const parseStockInput = (stock = {}) => {
  const parsed = {};
  Object.entries(stock).forEach(([group, units]) => {
    const numeric = Number(units);
    parsed[group] = Number.isNaN(numeric) ? 0 : numeric;
  });
  return parsed;
};

//register
app.get("/register", (req, res) => {
  res.render("auth/registerChoice");
});

// Hospital register and login routes
app.get("/register/hospital", (req, res) => {
  res.render("hospital/register");
});

app.post(
  "/register/hospital",
  wrapAsync(async (req, res) => {
    const { name, username, password, address, phone } = req.body;
    const existingHospital = await Hospital.findOne({ username });
    if (existingHospital) {
      return res.redirect("/register/hospital");
    }

    const hospital = new Hospital({
      name,
      username,
      password,
      address,
      phone,
    });
    await hospital.save();
    await logoutCurrentUser(req);
    delete req.session.bloodbankId;
    req.session.hospitalId = hospital._id;
    return res.redirect("/hospital/dashboard");
  }),
);

app.get("/login/hospital", (req, res) => {
  if (req.session.hospitalId) {
    return res.redirect("/hospital/dashboard");
  }
  return res.render("hospital/login");
});

app.post(
  "/login/hospital",
  wrapAsync(async (req, res) => {
    const hospital = await Hospital.findOne({ username: req.body.username });
    if (!hospital || !(await hospital.validatePassword(req.body.password))) {
      return res.redirect("/login/hospital");
    }
    await logoutCurrentUser(req);
    delete req.session.bloodbankId;
    req.session.hospitalId = hospital._id;
    return res.redirect("/hospital/dashboard");
  }),
);

const logoutHospital = (req, res, next) => {
  req.session.hospitalId = null;
  req.session.save((err) => {
    if (err) return next(err);
    return res.redirect("/login/hospital");
  });
};

app.post("/logout/hospital", logoutHospital);
app.get("/logout/hospital", logoutHospital);

//Blood bank register and login route
app.get("/register/bloodbank", (req, res) => {
  res.render("listings/new"); // existing form
});

app.post(
  "/register/bloodbank",
  wrapAsync(async (req, res) => {
    try {
      const { username, password, listing } = req.body;
      const existingBank = await Listing.findOne({ username });
      if (existingBank) {
        return res.redirect("/register/bloodbank");
      }

      // Manually map form fields to your specific schema fields
      const newListing = new Listing({
        name: listing.name,
        location: listing.location || listing.address,
        address: listing.address, // Corrected from 'location' to 'address' to match index route
        phone: listing.phone,
        timing: listing.timing,
        type: listing.type,
        username: username,
        password: password,
        available_blood_stock: parseStockInput(listing.available_blood_stock), // Store the actual object
      });

      await newListing.save();
      delete req.session.hospitalId;
      req.session.bloodbankId = newListing._id;
      res.redirect("/listings"); // Redirect immediately to see the new listing
    } catch (e) {
      console.error(e);
      res.redirect("/register/bloodbank");
    }
  }),
);

app.get(
  "/bloodbank/dashboard",
  isBloodBankLoggedIn,
  wrapAsync(async (req, res) => {
    // Find the specific bank using the ID stored in the session
    const bank = await Listing.findById(req.session.bloodbankId);

    if (!bank) {
      return res.redirect("/login/bloodbank");
    }

    const donationRequests = await Donation.find({ hospital: bank._id })
      .populate("donor")
      .sort({ createdAt: -1 });

    const stats = {
      total: donationRequests.length,
      pending: donationRequests.filter((reqItem) => reqItem.status === "Pending")
        .length,
      accepted: donationRequests.filter(
        (reqItem) => reqItem.status === "Accepted",
      ).length,
      rejected: donationRequests.filter(
        (reqItem) => reqItem.status === "Rejected",
      ).length,
    };

    res.render("listings/dashboard", {
      bank,
      donationRequests,
      stats,
    });
  }),
);

app.get(
  "/bloodbank/urgent-requests",
  isBloodBankLoggedIn,
  wrapAsync(async (req, res) => {
    const bank = await Listing.findById(req.session.bloodbankId);
    if (!bank) {
      return res.redirect("/login/bloodbank");
    }

    const urgentRequests = await UrgentRequest.find({ bloodbank: bank._id })
      .populate("hospital")
      .sort({ createdAt: -1 });

    const urgentStats = {
      total: urgentRequests.length,
      pending: urgentRequests.filter((reqItem) => reqItem.status === "Pending")
        .length,
      accepted: urgentRequests.filter(
        (reqItem) => reqItem.status === "Accepted",
      ).length,
      rejected: urgentRequests.filter(
        (reqItem) => reqItem.status === "Rejected",
      ).length,
    };

    return res.render("listings/urgentRequests", {
      bank,
      urgentRequests,
      urgentStats,
    });
  }),
);

app.get("/login/bloodbank", (req, res) => {
  if (req.session.bloodbankId) {
    return res.redirect("/bloodbank/dashboard");
  }
  if (req.session.hospitalId) {
    return res.redirect("/hospital/dashboard");
  }
  res.render("auth/loginBloodbank");
});

app.post("/login/bloodbank", async (req, res) => {
  const bank = await Listing.findOne({ username: req.body.username });
  if (!bank || !(await bank.validatePassword(req.body.password))) {
    return res.redirect("/login/bloodbank");
  }
  await logoutCurrentUser(req);
  delete req.session.hospitalId;
  req.session.bloodbankId = bank._id;
  return res.redirect("/bloodbank/dashboard");
});

const logoutBloodBank = (req, res, next) => {
  req.session.bloodbankId = null;
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("connect.sid");
    return res.redirect("/listings");
  });
};

app.post("/logout/bloodbank", logoutBloodBank);
app.get("/logout/bloodbank", logoutBloodBank);

//Donar
//registration form
app.get("/register/user", (req, res) => {
  res.render("user/new.ejs", { role: "donor" }); // Ensure your new.ejs is in views/user/
});

app.get("/register/donee", (req, res) => {
  res.render("user/new.ejs", { role: "donee" });
});

app.post(
  "/register/user",
  wrapAsync(async (req, res, next) => {
    try {
      let {
        username,
        password,
        role,
        age,
        bloodGroup,
        location,
        weight,
        diseases,
      } =
        req.body;
      const normalizedRole = role === "donee" ? "donee" : "donor";

      const newUser = new User({
        username,
        role: normalizedRole,
        age,
        bloodGroup,
        location,
        weight,
        diseases: diseases ? diseases.split(",").map((d) => d.trim()) : [],
      });

      // Register user with password using Passport
      const registeredUser = await User.register(newUser, password);

      // Automatically log in the user after registration
      req.login(registeredUser, (err) => {
        if (err) return next(err);
        delete req.session.bloodbankId;
        delete req.session.hospitalId;
        res.redirect("/listings"); // Redirect to home/listings page
      });
    } catch (e) {
      // If user already exists or other validation fails
      console.log(e.message);
      res.redirect("/register/user");
    }
  }),
);

//Donation Apply
// Donate Route
app.post("/donate/:id", isDonor, async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing || !listing.username) {
    return res.redirect("/listings");
  }

  const existingRequest = await Donation.findOne({
    donor: req.user._id,
    hospital: listing._id,
    requestType: "Donation",
    status: { $in: ["Pending", "Accepted"] },
  });
  if (existingRequest) {
    return res.redirect("/user/dashboard");
  }

  const newDonation = new Donation({
    donor: req.user._id,
    hospital: listing._id,
    bloodGroup: req.user.bloodGroup,
    requestType: "Donation",
  });

  await newDonation.save();
  return res.redirect("/user/dashboard");
});

app.post("/request-blood/:id", isDonee, async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing || !listing.username) {
    return res.redirect("/listings");
  }

  const existingRequest = await Donation.findOne({
    donor: req.user._id,
    hospital: listing._id,
    requestType: "BloodRequest",
    status: { $in: ["Pending", "Accepted"] },
  });
  if (existingRequest) {
    return res.redirect("/user/dashboard");
  }

  const newRequest = new Donation({
    donor: req.user._id,
    hospital: listing._id,
    bloodGroup: req.user.bloodGroup,
    requestType: "BloodRequest",
  });

  await newRequest.save();
  return res.redirect("/user/dashboard");
});

app.put("/donation/:id/status", isBloodBankLoggedIn, async (req, res) => {
  const { status } = req.body;
  const allowedStatus = ["Pending", "Accepted", "Rejected"];
  if (!allowedStatus.includes(status)) {
    return res.redirect("/bloodbank/dashboard");
  }

  const donation = await Donation.findById(req.params.id).populate("hospital");
  if (!donation || !donation.hospital) {
    return res.redirect("/bloodbank/dashboard");
  }

  if (donation.hospital._id.toString() !== req.session.bloodbankId.toString()) {
    return res.redirect("/bloodbank/dashboard");
  }

  donation.status = status;
  await donation.save();
  res.redirect("/bloodbank/dashboard");
});

// USER LOGIN FORM ROUTE
app.get("/login/user", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect("/user/dashboard");
  }
  if (req.session.hospitalId) {
    return res.redirect("/hospital/dashboard");
  }
  const selectedRole = req.query.role === "donee" ? "donee" : "donor";
  res.render("user/loginUser.ejs", { selectedRole });
});

app.post(
  "/login/user",
  (req, res, next) => {
    const selectedRole = req.body.role === "donee" ? "donee" : "donor";
    passport.authenticate("local", (err, user) => {
      if (err) return next(err);
      if (!user) return res.redirect(`/login/user?role=${selectedRole}`);

      const userRole = user.role || "donor";
      if (userRole !== selectedRole) {
        return res.redirect(`/login/user?role=${selectedRole}`);
      }

      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        delete req.session.bloodbankId;
        delete req.session.hospitalId;
        return res.redirect("/user/dashboard");
      });
    })(req, res, next);
  },
);

app.get("/logout/user", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    delete req.session.bloodbankId;
    delete req.session.hospitalId;
    return res.redirect("/login/user");
  });
});

app.get("/user/dashboard", isLoggedIn, async (req, res) => {
  const userRole = req.user.role || "donor";
  const requestType = userRole === "donee" ? "BloodRequest" : "Donation";
  const donations = await Donation.find({
    donor: req.user._id,
    requestType,
  }).populate("hospital");

  res.render("user/dashboard", { donations });
});

app.get(
  "/hospital/dashboard",
  isHospitalLoggedIn,
  wrapAsync(async (req, res) => {
    const hospital = await Hospital.findById(req.session.hospitalId);
    if (!hospital) {
      req.session.hospitalId = null;
      return res.redirect("/login/hospital");
    }

    const selectedBankId = req.query.bankId || "";
    const bloodBanks = await Listing.find({
      username: { $type: "string", $regex: /\S/ },
    }).sort({ name: 1 });
    const urgentRequests = await UrgentRequest.find({ hospital: hospital._id })
      .populate("bloodbank")
      .sort({ createdAt: -1 });

    const stats = {
      total: urgentRequests.length,
      pending: urgentRequests.filter((item) => item.status === "Pending").length,
      accepted: urgentRequests.filter((item) => item.status === "Accepted").length,
      rejected: urgentRequests.filter((item) => item.status === "Rejected").length,
    };

    res.render("hospital/dashboard", {
      hospital,
      bloodBanks,
      urgentRequests,
      stats,
      selectedBankId,
    });
  }),
);

app.post(
  "/hospital/urgent-request",
  isHospitalLoggedIn,
  wrapAsync(async (req, res) => {
    const { bloodbankId, bloodGroup, units, note } = req.body;
    const bloodbank = await Listing.findById(bloodbankId);
    if (!bloodbank || !bloodbank.username) {
      return res.redirect("/hospital/dashboard");
    }

    const parsedUnits = Number(units);
    if (Number.isNaN(parsedUnits) || parsedUnits < 1) {
      return res.redirect(`/hospital/dashboard?bankId=${bloodbankId}`);
    }

    const urgentRequest = new UrgentRequest({
      hospital: req.session.hospitalId,
      bloodbank: bloodbankId,
      bloodGroup,
      units: parsedUnits,
      note,
    });
    await urgentRequest.save();
    return res.redirect("/hospital/dashboard");
  }),
);

app.put(
  "/bloodbank/urgent-requests/:id/accept",
  isBloodBankLoggedIn,
  wrapAsync(async (req, res) => {
    const urgentRequest = await UrgentRequest.findById(req.params.id);
    if (!urgentRequest) {
      return res.redirect("/bloodbank/urgent-requests");
    }
    if (urgentRequest.bloodbank.toString() !== req.session.bloodbankId.toString()) {
      return res.redirect("/bloodbank/urgent-requests");
    }
    urgentRequest.status = "Accepted";
    await urgentRequest.save();
    return res.redirect("/bloodbank/urgent-requests");
  }),
);

app.put(
  "/bloodbank/urgent-requests/:id/reject",
  isBloodBankLoggedIn,
  wrapAsync(async (req, res) => {
    const urgentRequest = await UrgentRequest.findById(req.params.id);
    if (!urgentRequest) {
      return res.redirect("/bloodbank/urgent-requests");
    }
    if (urgentRequest.bloodbank.toString() !== req.session.bloodbankId.toString()) {
      return res.redirect("/bloodbank/urgent-requests");
    }
    urgentRequest.status = "Rejected";
    await urgentRequest.save();
    return res.redirect("/bloodbank/urgent-requests");
  }),
);

app.get("/dashboard", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect("/user/dashboard");
  }
  if (req.session.bloodbankId) {
    return res.redirect("/bloodbank/dashboard");
  }
  if (req.session.hospitalId) {
    return res.redirect("/hospital/dashboard");
  }
  return res.redirect("/login/user");
});

app.put(
  "/bloodbank/donations/:id/accept",
  isBloodBankLoggedIn,
  wrapAsync(async (req, res) => {
    const donation = await Donation.findById(req.params.id).populate("hospital");
    if (!donation || !donation.hospital) {
      return res.redirect("/bloodbank/dashboard");
    }
    if (donation.hospital._id.toString() !== req.session.bloodbankId.toString()) {
      return res.redirect("/bloodbank/dashboard");
    }
    donation.status = "Accepted";
    await donation.save();
    return res.redirect("/bloodbank/dashboard");
  }),
);

app.put(
  "/bloodbank/donations/:id/reject",
  isBloodBankLoggedIn,
  wrapAsync(async (req, res) => {
    const donation = await Donation.findById(req.params.id).populate("hospital");
    if (!donation || !donation.hospital) {
      return res.redirect("/bloodbank/dashboard");
    }
    if (donation.hospital._id.toString() !== req.session.bloodbankId.toString()) {
      return res.redirect("/bloodbank/dashboard");
    }
    donation.status = "Rejected";
    await donation.save();
    return res.redirect("/bloodbank/dashboard");
  }),
);

//Index Route
app.get(
  "/listings",
  wrapAsync(async (req, res) => {
    const { search } = req.query;
    const query = { username: { $type: "string", $regex: /\S/ } };

    if (search && search.trim() !== "") {
      query.address = { $regex: search, $options: "i" };
    }

    const allListings = await Listing.find(query);
    const processedListings = allListings
      .map((listing) => {
        const listingObj = listing.toObject();
        listingObj.isOpen = listing.timing
          ? getOpenStatus(listing.timing)
          : false;
        return listingObj;
      })
      .filter((listing) => {
        const hasBasicDetails =
          typeof listing.name === "string" &&
          listing.name.trim() &&
          typeof listing.address === "string" &&
          listing.address.trim() &&
          typeof listing.phone === "string" &&
          listing.phone.trim() &&
          typeof listing.timing === "string" &&
          listing.timing.trim();

        const stock = listing.available_blood_stock || {};
        const hasStockEntries = Object.keys(stock).length > 0;

        return hasBasicDetails && hasStockEntries;
      });

    res.render("listings/index.ejs", {
      allListings: processedListings,
      search,
    });
  }),
);

//New Route
app.get("/listings/new", (req, res) => {
  res.render("listings/new.ejs");
});

//Show Route
app.get(
  "/listings/:id",
  wrapAsync(async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
      throw new ExpressError(404, "Blood bank not found");
    }
    const listingObj = listing.toObject();
    listingObj.isOpen = getOpenStatus(listing.timing);
    res.render("listings/show.ejs", { listing: listingObj });
  }),
);

//Create Route
app.post(
  "/listings",
  validateListing,
  wrapAsync(async (req, res, next) => {
    let result = listingSchema.validate(req.body);
    console.log(result);
    if (result.error) {
      throw new ExpressError(400, result.error);
    }
    const newListing = new Listing(req.body.listing);
    await newListing.save();
    res.redirect("/listings");
  }),
);

//Edit Route
app.get(
  "/listings/:id/edit",
  isBloodBankLoggedIn,
  isBloodBankOwner,
  wrapAsync(async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    res.render("listings/edit.ejs", { listing: listing.toObject() });
  }),
);

//Update Route
app.put(
  "/listings/:id",
  isBloodBankLoggedIn,
  isBloodBankOwner,
  async (req, res) => {
    if (req.body.listing && req.body.listing.available_blood_stock) {
      req.body.listing.available_blood_stock = parseStockInput(
        req.body.listing.available_blood_stock,
      );
    }
    await Listing.findByIdAndUpdate(req.params.id, req.body.listing);
    res.redirect(`/listings/${req.params.id}`);
  },
);

//Delete Route
app.delete(
  "/listings/:id",
  isBloodBankLoggedIn,
  isBloodBankOwner,
  wrapAsync(async (req, res) => {
    let { id } = req.params;
    let deletedListing = await Listing.findByIdAndDelete(id);
    console.log(deletedListing);
    res.redirect("/listings");
  }),
);

//eligibility check route
app.get("/eligibility", (req, res) => {
  res.render("eligibility/eligibility.ejs");
});

//compatibility
app.get("/compatibility", (req, res) => {
  res.render("compatibility/compatibility.ejs");
});

// app.get("/testListing", async (req, res) => {
//   let sampleListing = new Listing({
//     name: "Gandhinagar Blood Bank Gift city",
//     type: "Private Hospital",
//     address: "667 Main Road, Gandhinagar, Gujarat",
//     distance_km: 4.7,
//     phone: "+91 9819929444",
//     timing: "24x7 Emergency",
//     status: "Open",
//     available_blood_stock: {
//       "A+": 27,
//       "A-": 15,
//       "B+": 3,
//       "B-": 18,
//       "AB+": 1,
//       "AB-": 13,
//       "O+": 26,
//       "O-": 28,
//     },
//   });
//   await sampleListing.save();
//   console.log("sample was saved");
//   res.send("successful testing");
// });

// Inside app.js Index Route
// const allListings = await Listing.find(query);

// const processedListings = allListings.map((listing) => {
//   const listingObj = listing.toObject();
//   // We manually add the isOpen property here
//   listingObj.isOpen = getOpenStatus(listing.timing);
//   return listingObj;
// });

// // Pass 'processedListings' to the EJS
// res.render("listings/index.ejs", { allListings: processedListings, search });

app.all("*path", (req, res, next) => {
  next(new ExpressError(404, "Page Not Found!"));
});

app.use((err, req, res, next) => {
  let { statusCode = 500, message = "Something went wrong!" } = err;
  res.status(statusCode).render("error.ejs", { err });
  // res.status(statusCode).send(message);
});

app.listen(8080, () => {
  console.log("server is listening to port 8080");
});
