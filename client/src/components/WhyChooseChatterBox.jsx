import React from 'react';
import Slider from 'react-slick';
import './WhyChooseChatterBox.css'; // Custom styles for the cards

function SampleNextArrow(props) {
  const { className, style, onClick } = props;
  return (
    <div
      className={className}
      style={{ ...style, display: "block", background: "#ff000000" }}
      onClick={onClick}
    />
  );
}

function SamplePrevArrow(props) {
  const { className, style, onClick } = props;
  return (
    <div
      className={className}
      style={{ ...style, display: "block", background: "#ff000000" }}
      onClick={onClick}
    />
  );
}

const WhyChooseChatterBox = () => {
  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 3, // Number of cards visible at once
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 1800, // Adjust speed (3 seconds per slide)
    centerMode: true, // Center the cards
    centerPadding: '20px',
    nextArrow: <SampleNextArrow />,
    prevArrow: <SamplePrevArrow />, // Adjust padding to increase space between individual cards
    responsive: [
      {
        breakpoint: 1024,
        settings: {
          slidesToShow: 2,
          slidesToScroll: 1,
          infinite: true,
          dots: true,
          centerMode: true,
          centerPadding: '40px', // Increased padding for larger screens
        },
      },
      {
        breakpoint: 600,
        settings: {
          slidesToShow: 1,
          slidesToScroll: 1,
          centerMode: true,
          centerPadding: '20px', // Adjust padding for smaller screens
        },
      },
    ],
  };

  return (
    <div className="why-choose-container">
      <h2 className="why-choose-heading">Why Choose ChatterBox?</h2>
      <Slider {...settings}>
        <div className="card">
          <h3>🚀 Easy to Use</h3>
          <p>We focus on user experience, so you can dive straight into conversations without a learning curve.</p>
        </div>
        <div className="card">
          <h3>⚡ Real-Time Updates</h3>
          <p>Instantly know when your friends are online and stay connected without delay.</p>
        </div>
        <div className="card">
          <h3>🔒 Security and Privacy</h3>
          <p>Your conversations are protected with the latest technology to ensure your chats stay between you and the people you care about.</p>
        </div>
      </Slider>
    </div>
  );
};

export default WhyChooseChatterBox;
