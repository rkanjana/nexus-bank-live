function calculateInterest() {
    let amount = document.getElementById("amount").value;
    let rate = document.getElementById("rate").value;
    let years = document.getElementById("years").value;

    if (amount === "" || rate === "" || years === "") {
        alert("Please fill in all fields");
        return;
    }

    let totalInterest = (amount * rate * years) / 100;
    document.getElementById("interest").innerText = `₹${totalInterest}`;
}
