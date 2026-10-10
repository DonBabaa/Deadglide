// The trick list. Press the trick button in the air and you get the next one
// down the list (it wraps around), so mashing it runs through the whole book.
// Add a trick by adding a line.
//   time  = seconds it takes
//   roll  = board flips along its length  (+ = kickflip direction, - = heelflip)
//   yaw   = board spins flat              (+ = backside shuvit, - = frontside)
//   pitch = board wraps end over end      (impossible)
//   all in full turns; boost = speed added when you land it (m/s)

export const TRICKS = [
  { name: 'Kickflip',         time: 0.38, roll: 1,  yaw: 0,    pitch: 0, boost: 3 },
  { name: 'Pop Shuvit',       time: 0.34, roll: 0,  yaw: 0.5,  pitch: 0, boost: 2.5 },
  { name: 'Heelflip',         time: 0.38, roll: -1, yaw: 0,    pitch: 0, boost: 3 },
  { name: 'Varial Kickflip',  time: 0.42, roll: 1,  yaw: 0.5,  pitch: 0, boost: 4.5 },
  { name: 'FS Shuvit',        time: 0.34, roll: 0,  yaw: -0.5, pitch: 0, boost: 2.5 },
  { name: 'Tre Flip',         time: 0.5,  roll: 1,  yaw: 1,    pitch: 0, boost: 6 },
  { name: 'Varial Heelflip',  time: 0.42, roll: -1, yaw: -0.5, pitch: 0, boost: 4.5 },
  { name: 'Hardflip',         time: 0.46, roll: 1,  yaw: -0.5, pitch: 0, boost: 5 },
  { name: '360 Shuvit',       time: 0.44, roll: 0,  yaw: 1,    pitch: 0, boost: 4.5 },
  { name: 'Inward Heelflip',  time: 0.46, roll: -1, yaw: 0.5,  pitch: 0, boost: 5 },
  { name: 'Impossible',       time: 0.5,  roll: 0,  yaw: 0,    pitch: 1, boost: 5.5 },
  { name: 'Double Kickflip',  time: 0.5,  roll: 2,  yaw: 0,    pitch: 0, boost: 5.5 },
  { name: 'Laser Flip',       time: 0.52, roll: -1, yaw: -1,   pitch: 0, boost: 6.5 },
  { name: 'Double Heelflip',  time: 0.5,  roll: -2, yaw: 0,    pitch: 0, boost: 5.5 },
];
