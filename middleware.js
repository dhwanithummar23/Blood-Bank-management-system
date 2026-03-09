const Listing = require("./models/listing");

module.exports.isLoggedIn = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login/user");
  }
  next();
};

module.exports.isDonor = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login/user");
  }
  const role = req.user.role || "donor";
  if (role !== "donor") {
    return res.redirect("/user/dashboard");
  }
  next();
};

module.exports.isDonee = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login/user");
  }
  if (req.user.role !== "donee") {
    return res.redirect("/user/dashboard");
  }
  next();
};

module.exports.isBloodBankOwner = async (req, res, next) => {
  if (!req.session.bloodbankId) {
    return res.redirect("/login/bloodbank");
  }

  let { id } = req.params;
  const listing = await Listing.findById(id);

  if (!listing) {
    return res.redirect("/listings");
  }

  if (listing._id.toString() !== req.session.bloodbankId.toString()) {
    return res.redirect("/bloodbank/dashboard");
  }

  next();
};

module.exports.isBloodBankLoggedIn = (req, res, next) => {
  if (!req.session.bloodbankId) {
    return res.redirect("/login/bloodbank");
  }
  next();
};

module.exports.isHospitalLoggedIn = (req, res, next) => {
  if (!req.session.hospitalId) {
    return res.redirect("/login/hospital");
  }
  next();
};
