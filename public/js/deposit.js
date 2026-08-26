document.getElementById("depositForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const emp_id = document.getElementById("emp_id").value;
    const account_number = document.getElementById("account_number").value;
    const amount = document.getElementById("amount").value;
    const messageBox = document.getElementById("message");

    if (!emp_id || !account_number || !amount || amount <= 0) {
        messageBox.textContent = "⚠️ Please fill all fields correctly.";
        messageBox.className = "error";
        return;
    }

    const data = { emp_id, account_number, amount };

    try {
        const response = await fetch("/deposit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            messageBox.textContent = `✅ ${result.message}`;
            messageBox.className = "success";
        } else {
            messageBox.textContent = `❌ ${result.error}`;
            messageBox.className = "error";
        }
    } catch (error) {
        messageBox.textContent = "❌ Server error. Try again later.";
        messageBox.className = "error";
    }
});
