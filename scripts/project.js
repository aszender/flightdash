document.addEventListener('DOMContentLoaded', () => {
    const apiKey = 'c07143ddcfd3c2c79edca72ce6c079e2';
    let currentDepartureWeatherCondition = '';
    let currentArrivalWeatherCondition = '';
    let selectedAirports = [];
    let cart = [];

    // Initialize the map
    const map = L.map('map').setView([20, 0], 2); // Center map at an initial location

    // Load cart data from localStorage
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
        updateCartDisplay();
    }

    // Add OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
    }).addTo(map);

    // Fetch airport data
    fetch('/public/mAirports.json')
        .then(response => response.json())
        .then(data => {
            data.forEach(airport => {
                const [lat, lon] = parseCoordinates(airport["Geographic Location"]);
                const marker = L.marker([lat, lon]).addTo(map);

                marker.bindPopup(`<b>${airport["Airport Name"]}</b><br>${airport["City Name"]}, ${airport["Country"]}`);

                marker.on('click', () => {
                    if (selectedAirports.length < 2) {
                        selectedAirports.push({ name: airport["Airport Name"], lat, lon });

                        // Fetch and display weather data
                        fetchWeatherData(lat, lon, (weatherData) => {
                            const weatherInfo = `
                            <br><b>Weather:</b> ${weatherData.weather[0].description}
                            <br><b>Temperature:</b> ${weatherData.main.temp}°C
                            `;
                            marker.bindPopup(`<b>${airport["Airport Name"]}</b><br>${airport["City Name"]}, ${airport["Country"]}${weatherInfo}`).openPopup();

                            // Store weather condition for the first and second airport
                            if (selectedAirports.length === 1) {
                                currentDepartureWeatherCondition = weatherData.weather[0].description;
                            } else if (selectedAirports.length === 2) {
                                currentArrivalWeatherCondition = weatherData.weather[0].description;

                                const distance = calculateDistance(selectedAirports[0], selectedAirports[1]);
                                alert(`Distance between ${selectedAirports[0].name} and ${selectedAirports[1].name} is ${distance.toFixed(2)} km`);

                                // Draw a line
                                const line = L.polyline([[selectedAirports[0].lat, selectedAirports[0].lon], [selectedAirports[1].lat, selectedAirports[1].lon]], { color: 'red' }).addTo(map);

                                // Fetch and update flight data
                                fetchFlightData(distance);

                                // Reset selected airports
                                selectedAirports = [];
                            }
                        });
                    }
                });
            });
        })
        .catch(error => {
            console.error('Error fetching the airport data:', error); //this is for debugging my code
        });

    // Events listeners for the Shopping Cart and Home links
    document.getElementById('shoppingCartLink').addEventListener('click', function(event) {
        event.preventDefault();
        //show the cart
        const cartCanvas = new bootstrap.Offcanvas(document.getElementById('cartCanvas'));
        cartCanvas.show();
    });
    document.getElementById('homeLink').addEventListener('click', function(event) {
        event.preventDefault();
        //reload the page
        location.reload();
    });

    // Function to fetch weather data from OpenWeatherMap API
    function fetchWeatherData(lat, lon, callback) {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (callback) callback(data);
            })
            .catch(error => console.error('Error fetching the weather data:', error));
    }

    // Function to parse the "Geographic Location" field
    function parseCoordinates(geoString) {
        const latMatch = geoString.match(/(\d{2,4})(\d{2})([NS])/);
        const lonMatch = geoString.match(/(\d{2,5})(\d{2})([EW])/);

        if (!latMatch || !lonMatch) {
            console.error('Invalid geographic location format:', geoString);
            return [0, 0];
        }

        let latDegrees = parseInt(latMatch[1]);
        let latMinutes = parseInt(latMatch[2]);
        let latDirection = latMatch[3];

        let lonDegrees = parseInt(lonMatch[1]);
        let lonMinutes = parseInt(lonMatch[2]);
        let lonDirection = lonMatch[3];

        // Convert to decimal degrees
        let lat = latDegrees + latMinutes / 60;
        if (latDirection === 'S') lat = -lat;

        let lon = lonDegrees + lonMinutes / 60;
        if (lonDirection === 'W') lon = -lon;

        return [lat, lon];
    }

    // Function to calculate distance between two points
    function calculateDistance(point1, point2) {
        const R = 6371;
        const lat1 = point1.lat * Math.PI / 180;
        const lat2 = point2.lat * Math.PI / 180;
        const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
        const deltaLon = (point2.lon - point1.lon) * Math.PI / 180;

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    // Function to fetch and update flight data based on the distance
    function fetchFlightData(distance, filterType) {
        fetch('/public/fake_flights.json')
            .then(response => response.json())
            .then(data => {
                let filteredFlights = data;

                // Apply filter by plane
                if (filterType) {
                    filteredFlights = filteredFlights.filter(flight => flight.type_of_plane === filterType);
                }

                // Adjust costs based on weather conditions
                filteredFlights = filteredFlights.map(flight => {
                    let baseCost = flight.price_per_km * distance + flight.extraFuelCharge;
                    let weatherSurcharge = 0;

                    if (currentDepartureWeatherCondition.includes("rain") || currentDepartureWeatherCondition.includes("storm")) {
                        weatherSurcharge += 0.10 * baseCost; // 10% increase due to bad weather at departure
                    }
                    if (currentArrivalWeatherCondition.includes("rain") || currentArrivalWeatherCondition.includes("storm")) {
                        weatherSurcharge += 0.10 * baseCost; // 10% increase due to bad weather at arrival
                    }

                    let adjustedCost = baseCost + weatherSurcharge;

                    return {
                        ...flight,
                        distance: distance,
                        adjustedCost: adjustedCost,
                        weatherSurcharge: weatherSurcharge,
                    };
                });

                // Display the flights with adjusted costs
                const flightCatalog = document.getElementById('flight-catalog');
                flightCatalog.innerHTML = ''; // Clear flights

                filteredFlights.forEach(flight => {
                    const flightCard = document.createElement('div');
                    flightCard.classList.add('col');

                    flightCard.innerHTML = `
                    <div class="card h-100">
                        <img src="${flight.plane_image}" class="card-img-top" alt="${flight.type_of_plane}">
                        <div class="card-body">
                            <h5 class="card-title">${flight.type_of_plane}</h5>
                            <p class="card-text">Speed: ${flight.speed_kph} KPH</p>
                            <p class="card-text">Seats Remaining: ${flight.seats_remaining}</p>
                            <p class="card-text">Distance: ${flight.distance} km</p>
                            <p class="card-text">Cost per KM: $${flight.price_per_km}</p>
                            <p class="card-text">Fuel Charge: $${flight.extraFuelCharge}</p>
                            <p class="card-text">Weather Surcharge: $${flight.weatherSurcharge.toFixed(2)}</p>
                            <p class="card-text"><strong>Total Cost: $${flight.adjustedCost.toFixed(2)}</strong></p>
                            <button class="btn btn-primary book-now" data-flight='${JSON.stringify(flight).replace(/"/g, '&quot;')}'>Book Now</button>
                        </div>
                    </div>
                `;

                    flightCatalog.appendChild(flightCard);
                });

                // "Book Now" buttons
                document.querySelectorAll('.book-now').forEach(button => {
                    button.addEventListener('click', function() {
                        const flightData = this.getAttribute('data-flight');
                        addToCart(flightData);
                    });
                });

            })
            .catch(error => {
                console.error('Error fetching the flight data:', error);
            });
    }

    // Function to add flights to the cart
    window.addToCart = function(flightData) {
        const flight = JSON.parse(flightData);
        cart.push(flight);
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartDisplay();
        alert(`${flight.type_of_plane} has been added to your cart.`);
    }

    // Function to update the cart display
    function updateCartDisplay() {
        const cartCanvasBody = document.querySelector('.offcanvas-body');
        cartCanvasBody.innerHTML = ''; // Clear current cart

        if (cart.length === 0) {
            cartCanvasBody.innerHTML = '<p>No items in the cart yet.</p>';
        } else {
            cart.forEach((flight, index) => {
                const flightCost = flight.adjustedCost || (flight.price_per_km * flight.distance + flight.extraFuelCharge);
                const weatherSurcharge = flight.weatherSurcharge || 0;

                const flightItem = document.createElement('div');
                flightItem.classList.add('cart-item', 'mb-3', 'p-3', 'border', 'rounded');

                flightItem.innerHTML = `
                <h6>${flight.type_of_plane}</h6>
                <p>Distance: ${flight.distance.toFixed(2)} km</p>
                ${weatherSurcharge > 0 ? `<p>Weather Surcharge: $${weatherSurcharge.toFixed(2)}</p>` : ''}
                <p>Flight Cost: $${flightCost.toFixed(2)}</p>
                <button class="btn btn-danger btn-sm" onclick="removeFromCart(${index})">Remove</button>
            `;

                cartCanvasBody.appendChild(flightItem);
            });

            const totalCost = cart.reduce((total, flight) => total + (flight.adjustedCost || (flight.price_per_km * flight.distance + flight.extraFuelCharge)), 0);

            const checkoutButton = document.createElement('button');
            checkoutButton.classList.add('btn', 'btn-primary', 'w-100', 'mt-3');
            checkoutButton.innerText = "Proceed to Checkout";
            checkoutButton.onclick = openCheckoutModal;

            cartCanvasBody.appendChild(checkoutButton);
        }

        // Show the offcanvas
        const offcanvas = new bootstrap.Offcanvas(document.getElementById('cartCanvas'));
        offcanvas.show();
    }

    // Function to remove a flight from the cart
    window.removeFromCart = function(index) {
        cart.splice(index, 1);
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartDisplay();
    }

    //plane type filter
    document.getElementById('planeTypeFilter').addEventListener('change', function() {
        const selectedType = this.value;
        fetchFlightData(null, selectedType);
    });

    // Checkout Modal
    function openCheckoutModal() {
        if (cart.length === 0) {
            alert('Your cart is empty. Please add flights to proceed.');
            return;
        }
        populateBookingDetails();
        const checkoutModal = new bootstrap.Modal(document.getElementById('checkoutModal'));
        checkoutModal.show();
    }

    // Form submission handler
    document.getElementById('checkoutForm').addEventListener('submit', function(event) {
        event.preventDefault();

        //passenger details
        const name = document.getElementById('passengerName').value;
        const email = document.getElementById('passengerEmail').value; // Use the email from the form
        const phone = document.getElementById('passengerPhone').value;

        if (!name || !email || !phone) {
            alert('Please fill in all the required fields.');
            return;
        }

        // Prepare flight details for the email and calculate total cost
        let flightDetails = '';
        let calculatedTotalCost = 0;

        cart.forEach(flight => {
            const flightCost = flight.adjustedCost; // cost including weather surcharge
            calculatedTotalCost += flightCost;

            flightDetails += `
        Flight: ${flight.type_of_plane}\n
        Distance: ${flight.distance.toFixed(2)} km\n
        Price per KM: $${flight.price_per_km}\n
        Extra Fuel Charge: $${flight.extraFuelCharge}\n
        Weather Surcharge: $${flight.weatherSurcharge.toFixed(2)}\n
        Total Cost: $${flightCost.toFixed(2)}\n
        -------------------------\n
        `;
        });

        // Create order
        const order = {
            passenger: { name, email, phone },
            flights: cart,
            totalCost: calculatedTotalCost.toFixed(2)
        };

        // Save the order
        localStorage.setItem('latestOrder', JSON.stringify(order));

        // Clear cart after booking
        cart = [];
        localStorage.removeItem('cart');
        updateCartDisplay();

        // Send the confirmation email with flight details
        sendEmail(email, flightDetails, calculatedTotalCost.toFixed(2));

        // Show booking confirmation
        document.getElementById('step3').innerHTML = `
    <h5>Booking Confirmed!</h5>
    <p>Thank you, ${name}. Your booking has been confirmed.</p>
    <p>An email confirmation has been sent to ${email}.</p>
    <p>Total Cost: $${calculatedTotalCost.toFixed(2)}</p>
    <button type="button" class="btn btn-primary" data-bs-dismiss="modal" onclick="clearCheckoutModal()">Close</button>
    `;
    });

// populateBookingDetails function
    function populateBookingDetails() {
        const bookingDetailsDiv = document.getElementById('bookingDetails');
        bookingDetailsDiv.innerHTML = '';
        let totalCost = 0;
        cart.forEach((flight) => {
            const flightCost = flight.adjustedCost; // Use adjusted cost including weather surcharge
            totalCost += flightCost;

            const flightDiv = document.createElement('div');
            flightDiv.classList.add('card', 'mb-3');
            flightDiv.innerHTML = `
        <div class="card-body">
            <h6 class="card-title">${flight.type_of_plane}</h6>
            <p class="card-text">Distance: ${flight.distance.toFixed(2)} km</p>
            <p class="card-text">Price per KM: $${flight.price_per_km}</p>
            <p class="card-text">Extra Fuel Charge: $${flight.extraFuelCharge}</p>
            <p class="card-text">Weather Surcharge: $${flight.weatherSurcharge.toFixed(2)}</p>
            <p class="card-text"><strong>Flight Cost: $${flightCost.toFixed(2)}</strong></p>
        </div>
        `;
            bookingDetailsDiv.appendChild(flightDiv);
        });

        const totalDiv = document.createElement('div');
        totalDiv.classList.add('text-end', 'mt-3');
        totalDiv.innerHTML = `<h5>Total Cost: $${totalCost.toFixed(2)}</h5>`;
        bookingDetailsDiv.appendChild(totalDiv);
    }

    // Send Email with EmailJS ): This is extra teacher >)
    function sendEmail(recipientEmail, flightDetails, totalCost) {
        const templateParams = {
            to_name: 'Passenger',
            from_name: 'Flight Dashboard',
            flight_details: flightDetails,
            total_cost: totalCost,
            to_email: recipientEmail
        };

        emailjs.send('service_gbc95v1', 'template_cwsq59n', templateParams)
            .then(function(response) {
                alert('Email sent successfully!');
                clearCartAndBookingDetails();
            }, function(error) {
                console.error('FAILED...', error);
                alert('Failed to send email.');
            });
    }

    // Clear the modal
    document.getElementById('checkoutModal').addEventListener('hidden.bs.modal', clearCartAndBookingDetails);

    // Functions to clear the cart and reset the booking details
    function closeModalBackdrop() {
        const modalBackdrop = document.querySelector('.modal-backdrop');
        if (modalBackdrop) {
            modalBackdrop.remove();
        }
        document.body.classList.remove('modal-open');
        document.body.style = '';
    }
    function clearCartAndBookingDetails() {
        // Clear the cart data
        cart = [];
        localStorage.removeItem('cart');
        updateCartDisplay(); // Clear the cart display

        // Clear booking details in the modal
        const bookingDetails = document.getElementById('bookingDetails');
        if (bookingDetails) bookingDetails.innerHTML = '';

        const confirmationDetails = document.getElementById('confirmationDetails');
        if (confirmationDetails) confirmationDetails.innerHTML = '';

        // Reset the form
        const checkoutForm = document.getElementById('checkoutForm');
        if (checkoutForm) checkoutForm.reset();

        // Close the modal and remove backdrop
        const checkoutModalElement = document.getElementById('checkoutModal');
        if (checkoutModalElement) {
            const checkoutModal = bootstrap.Modal.getInstance(checkoutModalElement);
            if (checkoutModal) {
                checkoutModal.hide();
            }
            closeModalBackdrop();
        }
    }

});
//

function goToStep1() {
    // Go back to the booking details (step 1)
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step1').style.display = 'block';
}

function goToStep2() {
    // Ensure booking details are valid before moving to step 2
    document.getElementById('step1').style.display = 'none';
    document.getElementById('step2').style.display = 'block';
}

function goToStep3() {
    // Validate passenger details
    const name = document.getElementById('passengerName').value;
    const email = document.getElementById('passengerEmail').value;
    const phone = document.getElementById('passengerPhone').value;

    if (name && email && phone) {
        document.getElementById('step2').style.display = 'none';
        document.getElementById('step3').style.display = 'block';

        document.getElementById('confirmationDetails').innerHTML = `
            <p>Name: ${name}</p>
            <p>Email: ${email}</p>
            <p>Phone: ${phone}</p>
        `;
    } else {
        alert('Please fill in all required fields.');
    }
}

function clearCheckoutModal() {
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');

    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'none';

    const bookingDetailsDiv = document.getElementById('bookingDetails');
    if (bookingDetailsDiv) bookingDetailsDiv.innerHTML = '';
}



