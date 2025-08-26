// 场景和相机
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 光源
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);

// 底座
const base = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 0.5, 32),
  new THREE.MeshStandardMaterial({ color: 0x555555 })
);
scene.add(base);

// 第一段连杆
const link1 = new THREE.Mesh(
  new THREE.CylinderGeometry(0.2, 0.2, 3),
  new THREE.MeshStandardMaterial({ color: 0xff0000 })
);
link1.position.y = 1.5; // 调整中心位置
base.add(link1);

// 第一个关节
const joint1 = new THREE.Mesh(
  new THREE.SphereGeometry(0.25, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0x0000ff })
);
joint1.position.y = 1.5;
link1.add(joint1);

// 第二段连杆
const link2 = new THREE.Mesh(
  new THREE.CylinderGeometry(0.15, 0.15, 2),
  new THREE.MeshStandardMaterial({ color: 0x00ff00 })
);
link2.position.y = 1; // 相对于 joint1
joint1.add(link2);

// 渲染循环
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
