import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import Swal from "sweetalert2";
import "../../styles/components.css";

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic validation alert
    if (!formData.email || !formData.password) {
      Swal.fire("Missing fields", "Please enter both email and password.", "warning");
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/auth/login`,
        formData
      );

      

      // Save user data
      localStorage.setItem("user", JSON.stringify(response.data.user));
      localStorage.setItem("token", response.data.token);

      // Redirect after short delay
      setTimeout(() => navigate("/dashboard"));

    } catch (err) {
      const errorMsg = err.response?.data?.error || "Login failed. Please check your credentials.";
      Swal.fire("Login Failed", errorMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      
      {loading && (
        <div className="screen-spinner">
          <div className="loader"></div>
          <p className="loader-text">Signing you in...</p>
        </div>
      )}

      <video className="bg-video" autoPlay loop muted playsInline>
        <source src="/assets/chat-bg3.mp4" type="video/mp4" />
      </video>

      <div className="auth-card">
        <div className="auth-header">
          <h1>Welcome Back</h1>
          <p>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="Enter your email"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>
         
          <button className="auth-button" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        

        <div className="auth-footer">
          Don’t have an account?{" "}
          <Link to="/signup" className="auth-link">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
