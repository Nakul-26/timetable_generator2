import React from "react";

function ErrorMessage({ message }) {
  return (
    <div style={{ color: "red", margin: "10px 0" }}>
      ⚠️ {message}
    </div>
  );
}

export default ErrorMessage;
