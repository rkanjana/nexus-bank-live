document.addEventListener("DOMContentLoaded", function () {
    const accountForm = document.getElementById("accountForm");
    const otpInfo = document.getElementById("otpInfo");
    const otpForm = document.getElementById("otpForm");
    const goToOtpFormBtn = document.getElementById("goToOtpForm");
    const backToAccountBtn = document.getElementById("backToAccount");

    let userEmail = ""; // Store email for OTP verification

    // Handle account form submission
    accountForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const formData = new FormData(this);
        const jsonObject = {};
        formData.forEach((value, key) => {
            jsonObject[key] = value;
        });

        try {
            // Send form data to server
            const response = await fetch("/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(jsonObject),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Form submission failed");

            userEmail = jsonObject.mailingAddress; // Store email for OTP verification

            if (!userEmail) {
                alert("Email is required for OTP verification.");
                return;
            }

            // Store email in localStorage for later OTP verification
            localStorage.setItem("email", userEmail);

            // Send OTP
            const otpResponse = await fetch("/send-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: userEmail })
            });

            const otpResult = await otpResponse.json();
            if (!otpResponse.ok) throw new Error(otpResult.error || "Failed to send OTP");

            // Show OTP section
            otpInfo.style.display = "block";
            accountForm.style.display = "none";

        } catch (error) {
            console.error("Error:", error);
            alert(error.message);
        }
    });

    // Show OTP form when "Enter OTP" button is clicked
    goToOtpFormBtn.addEventListener("click", function () {
        otpInfo.style.display = "none";
        otpForm.style.display = "block";
    });

    // Handle OTP verification
    document.getElementById("otpForm").addEventListener("submit", async function (event) {
        event.preventDefault();
    
        const otp = document.getElementById("otpInput").value;
        const email = localStorage.getItem("email");
    
        if (!email) {
            alert("Email not found. Please restart the process.");
            return;
        }
    
        try {
            const response = await fetch("/verify-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, otp })
            });
    
            const data = await response.json();
    
            if (response.ok) {
                // Redirect to account details page with account number & password
                window.location.href = `account.html?account=${data.account_number}&password=${data.password}`;
            } else {
                alert(data.message);
            }
        } catch (error) {
            console.error("Error:", error);
            alert("OTP verification failed. Please try again.");
        }
    });
    

    // Handle back button to return to account form
    backToAccountBtn.addEventListener("click", function () {
        otpInfo.style.display = "none";
        otpForm.style.display = "none";
        accountForm.style.display = "block";
    });
});
